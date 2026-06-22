"""
Automated Response Generation Module
======================================
Generates intelligent, context-aware responses for support tickets.

Features:
  - Tone control: formal | friendly | urgent
  - Category-specific response templates per department
  - First-response automation on ticket creation
  - Agent reply suggestions with one-click insert
  - Status-change automated messages (assigned, resolved, escalated)
  - Fallback templates when Groq is unavailable
"""

import json
from typing import Literal
from app.core.config import settings

ToneType = Literal["formal", "friendly", "urgent"]

# ─── Tone Definitions ─────────────────────────────────────────────────────────
TONE_INSTRUCTIONS = {
    "formal": (
        "Use a professional, formal tone. Clear and concise. "
        "Address the employee respectfully. No slang or contractions. "
        "Sign off professionally."
    ),
    "friendly": (
        "Use a warm, approachable tone. Be helpful and reassuring. "
        "Use contractions naturally. Show genuine care. "
        "Make the employee feel supported."
    ),
    "urgent": (
        "Use a direct, action-oriented tone. Acknowledge urgency immediately. "
        "State exactly what is happening right now to fix this. "
        "Give a clear timeline. No filler words."
    ),
}

# ─── Category-Specific Response Templates (fallback) ─────────────────────────
FALLBACK_TEMPLATES = {
    # HR
    "Leave Request": {
        "formal":   "Your leave request has been received and is under review. We will confirm availability and approval within 1 business day. Please ensure your team is aware of your planned absence.",
        "friendly": "Got your leave request! We'll check the team calendar and get back to you within a day. Make sure to give your team a heads up in the meantime 😊",
        "urgent":   "Leave request received. Reviewing now. Response within 4 hours.",
    },
    "Payslip": {
        "formal":   "We have received your payslip query. Our HR team is investigating the discrepancy and will provide a resolution within 2 business days. We apologise for any inconvenience.",
        "friendly": "Thanks for flagging this! We're looking into the payslip issue and will sort it out within 2 days. You'll hear from us soon.",
        "urgent":   "Payslip issue escalated to HR immediately. Investigating now. Update within 2 hours.",
    },
    "HR Policy": {
        "formal":   "Thank you for your policy enquiry. We will provide you with the relevant policy documentation and clarification within 1 business day.",
        "friendly": "Great question! We'll pull up the relevant policy details and send them your way shortly.",
        "urgent":   "Policy clarification request received. Expediting response due to urgency.",
    },
    # IT
    "Password Reset": {
        "formal":   "Your password reset request has been received. A temporary password will be sent to your registered email within 15 minutes. Please change it upon first login.",
        "friendly": "On it! A temporary password is on its way to your email within 15 minutes. Don't forget to change it when you log in!",
        "urgent":   "Password reset initiated now. Check your email in 5 minutes. If not received, reply immediately.",
    },
    "VPN Access": {
        "formal":   "Your VPN connectivity issue has been logged and assigned to our IT team. A technician will contact you within 2 hours. Please ensure your client software is updated to the latest version.",
        "friendly": "We've picked up your VPN issue! Our IT team is on it and will reach out within 2 hours. In the meantime, try updating your VPN client if you haven't already.",
        "urgent":   "VPN issue critical — IT assigned right now. Expect a call within 30 minutes. Do not restart your machine.",
    },
    "Hardware": {
        "formal":   "Your hardware issue has been logged. An IT technician will assess and resolve the matter within 1 business day. If the issue is blocking your work, please notify us and we will prioritise accordingly.",
        "friendly": "Hardware trouble noted! Our IT team will swing by within a day to get you sorted. If it's really holding you up, just let us know and we'll fast-track it.",
        "urgent":   "Hardware failure escalated. Technician dispatched. ETA 1 hour.",
    },
    # Finance
    "Expense Claim": {
        "formal":   "Your expense claim has been received and is under review by our Finance team. Claims are typically processed within 3–5 business days. Please ensure all receipts are attached.",
        "friendly": "Expense claim received! Finance will review it within 3–5 days. Make sure your receipts are all attached and you're good to go 👍",
        "urgent":   "Expense claim flagged as urgent. Finance reviewing immediately. Response within 4 hours.",
    },
    "Payroll": {
        "formal":   "Your payroll query has been escalated to our Finance team for immediate investigation. We will contact you within 1 business day with a full resolution.",
        "friendly": "We've picked up your payroll concern and flagged it to Finance. They'll be in touch within a day — we know how important this is!",
        "urgent":   "Payroll discrepancy escalated immediately. Finance investigating now. Resolution before end of business today.",
    },
    # Operations
    "Facilities": {
        "formal":   "Your facilities request has been logged and assigned to our Operations team. The matter will be addressed within 2 business days. For urgent safety concerns, please contact reception directly.",
        "friendly": "Facilities request logged! The ops team will get on this within 2 days. If it's a safety issue, please let reception know right away.",
        "urgent":   "Facilities issue escalated. Operations team dispatched. ETA 2 hours.",
    },
    "Office Supplies": {
        "formal":   "Your office supplies request has been received. Items will be sourced and delivered to your desk within 2 business days.",
        "friendly": "Supplies request noted! We'll get those to your desk within a couple of days.",
        "urgent":   "Urgent supplies request received. Checking stock now. Delivery today if available.",
    },
    # Generic fallback
    "General Support": {
        "formal":   "Thank you for contacting support. Your request has been received and assigned to the appropriate team. We will respond within 1 business day.",
        "friendly": "Thanks for reaching out! Your request is with the right team and we'll be in touch soon.",
        "urgent":   "Request received and escalated. Team responding now.",
    },
}

# ─── System Prompt ─────────────────────────────────────────────────────────────
def _build_system_prompt(tone: ToneType, agent_role: str, context: str = "") -> str:
    tone_instruction = TONE_INSTRUCTIONS[tone]
    role_context = {
        "ai_intern": (
            "You are the AI Intern — a data/reporting analyst who ALSO owns the company's "
            "AI tooling (AI chatbot, Copilot-type assistant) end-to-end. "
            "For data/reporting requests: confirm what analysis/report you will produce and "
            "give a delivery timeline. "
            "For AI tool issues (not responding, slow, errors, login problems): give specific, "
            "numbered troubleshooting steps — restart the tool, clear cache/cookies, check "
            "for ongoing outages, try a different browser, re-authenticate — and confirm "
            "whether you've checked the AI service status. "
            "You do NOT fix non-AI IT issues, reset passwords for general systems, or handle HR approvals."
        ),
        "it_support_technician": (
            "You are the IT Support Assistant — an IT technician. "
            "You handle passwords, VPN, hardware, software, email, printers, account access, and device issues. "
            "Your replies give specific, numbered troubleshooting steps tailored to the exact problem. "
            "You do NOT do data analysis, payroll, workflow automation, or anything involving "
            "AI tools/chatbots/Copilot — those go to the AI Intern."
        ),
        "junior_operations": (
            "You are Junior Automation Support — a workflow and automation specialist. "
            "You handle broken workflows, failed scheduled jobs, integration failures, and automation bugs. "
            "Your replies ask for the specific workflow name and failure details, or confirm the fix steps. "
            "You do NOT handle passwords, hardware, or data analysis."
        ),
        "admin": (
            "You are a Support Manager with full visibility across all departments. "
            "You provide oversight, escalation management, and professional status updates."
        ),
    }.get(agent_role, "You are a professional enterprise support agent.")

    return f"""You are TicketIQ's automated response engine.

{role_context}

TONE: {tone_instruction}

RULES:
1. Never start with "I hope this email finds you well" or any similar filler
2. Acknowledge the specific issue in the first sentence
3. State exactly what action is being taken
4. Give a realistic timeline (use the SLA context if provided)
5. End with a clear next step for the employee
6. Keep under 120 words
7. Do not make promises you cannot keep
8. If the issue is urgent or critical, reflect that urgency immediately

{context}

Respond with ONLY the message body — no subject line, no greeting like "Dear X", no sign-off name."""


async def generate_auto_response(
    title: str,
    description: str,
    category: str,
    department: str,
    priority: str,
    tone: ToneType,
    agent_role: str,
    trigger: str = "new_ticket",
) -> dict:
    """
    Generate an automated response for a ticket.

    trigger options:
      new_ticket   — first response when ticket is created
      agent_reply  — agent is drafting a reply
      resolved     — ticket marked resolved
      escalated    — ticket escalated
      assigned     — ticket assigned to agent
    """

    # Build context string from trigger
    trigger_context = {
        "new_ticket": f"This is the FIRST automated response. The ticket was just submitted. Priority: {priority.upper()}.",
        "agent_reply": f"An agent is drafting a reply to an open ticket. Priority: {priority.upper()}.",
        "resolved": "The ticket has been RESOLVED. Write a professional closure message confirming resolution and asking if further help is needed.",
        "escalated": "The ticket has been ESCALATED to senior support. Acknowledge the escalation and reassure the employee.",
        "assigned": f"The ticket has just been ASSIGNED to an agent. Confirm assignment and set expectations. Priority: {priority.upper()}.",
    }.get(trigger, "")

    system_prompt = _build_system_prompt(tone, agent_role, trigger_context)

    # Try GROQ first
    if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("gsk_your"):
        try:
            from groq import AsyncGroq
            groq = AsyncGroq(api_key=settings.GROQ_API_KEY)
            response = await groq.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": (
                            f"Department: {department}\n"
                            f"Category: {category}\n"
                            f"Priority: {priority}\n"
                            f"Title: {title}\n\n"
                            f"Employee's description:\n{description}"
                        ),
                    },
                ],
                temperature=_tone_temperature(tone),
                max_tokens=250,
            )
            text = response.choices[0].message.content.strip()
            return {
                "response":   text,
                "tone":       tone,
                "trigger":    trigger,
                "category":   category,
                "generated_by": "groq",
            }
        except Exception as e:
            print(f"[AutoResponse] GROQ failed: {e} — using template")

    # Fallback to templates
    template_key = _match_template(category)
    templates = FALLBACK_TEMPLATES.get(template_key, FALLBACK_TEMPLATES["General Support"])
    text = templates.get(tone, templates["formal"])

    return {
        "response":     text,
        "tone":         tone,
        "trigger":      trigger,
        "category":     category,
        "generated_by": "template",
    }


async def generate_all_tones(
    title: str,
    description: str,
    category: str,
    department: str,
    priority: str,
    agent_role: str,
    trigger: str = "agent_reply",
) -> dict:
    """Generate responses in all 3 tones at once for the UI tone picker."""
    results = {}
    for tone in ("formal", "friendly", "urgent"):
        r = await generate_auto_response(
            title, description, category, department, priority, tone, agent_role, trigger
        )
        results[tone] = r["response"]
    return {
        "tones":        results,
        "category":     category,
        "generated_by": "groq" if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("gsk_your") else "template",
    }


def _tone_temperature(tone: ToneType) -> float:
    return {"formal": 0.3, "friendly": 0.7, "urgent": 0.2}[tone]


def _match_template(category: str) -> str:
    category_lower = category.lower()
    mapping = {
        "leave": "Leave Request",
        "vacation": "Leave Request",
        "annual": "Leave Request",
        "sick": "Leave Request",
        "maternity": "Leave Request",
        "paternity": "Leave Request",
        "payslip": "Payslip",
        "payroll": "Payroll",
        "salary": "Payroll",
        "password": "Password Reset",
        "vpn": "VPN Access",
        "network": "VPN Access",
        "laptop": "Hardware",
        "hardware": "Hardware",
        "computer": "Hardware",
        "expense": "Expense Claim",
        "reimbursement": "Expense Claim",
        "invoice": "Expense Claim",
        "budget": "Payroll",
        "facilities": "Facilities",
        "office": "Facilities",
        "chair": "Facilities",
        "maintenance": "Facilities",
        "repair": "Facilities",
        "supplies": "Office Supplies",
        "hr": "HR Policy",
        "policy": "HR Policy",
        "contract": "HR Policy",
    }
    for key, template in mapping.items():
        if key in category_lower:
            return template
    return "General Support"


# ─── Self-Help Suggestions Engine ────────────────────────────────────────────

SELF_HELP_SYSTEM_PROMPT = """You are TicketIQ's first-line resolution engine for enterprise employees.

MOST IMPORTANT RULE: Your response must be 100% specific to the ticket provided.
Read the TICKET TITLE and EMPLOYEE DESCRIPTION carefully. Every step, every sentence,
every piece of advice must directly reference the actual problem this employee described.
NEVER give a generic response. If two different tickets have different titles, your
responses must be visibly different and tailored to each one.

Your goal is to ACTUALLY SOLVE the problem right now — think like an experienced
colleague sitting next to them who knows the exact answer.

CORE PRINCIPLES:
1. DIRECT ANSWER FIRST. If the ticket is a question ("how do I...", "what is...",
   "can I...") — answer it directly in `likely_solution`. Use standard enterprise
   policy knowledge. Be specific. Note if agent confirmation is needed for
   binding/financial decisions.
2. FOR TECHNICAL PROBLEMS — give numbered fix steps in order of: safest first,
   most likely to work, least disruptive. Each step must name the specific thing
   the employee mentioned (e.g. if they said "Outlook" say Outlook, not "email app").
3. DO NOT DO list — specific things to avoid that could make THIS specific problem
   worse. Not generic warnings — things directly relevant to what they described.
4. FORBIDDEN STEPS — never include as a numbered step:
   - "Ask a colleague if they have the same issue"
   - "Take a screenshot"
   - "Wait for the agent"
   - "Contact IT" (they already did)
   - Any step that only gathers info without attempting a fix
5. Keep each instruction under 30 words. Include time estimate and success indicator.

Respond ONLY with valid JSON:
{
  "can_self_resolve": true/false,
  "confidence": 0.0-1.0,
  "summary": "one sentence: what this problem likely is",
  "likely_solution": "If this is a question with a known answer, answer it directly here in 1-3 sentences. If it's a technical fault with no single-shot answer, set this to null.",
  "steps": [
    {
      "order": 1,
      "title": "Short action title",
      "instruction": "Exact step to take that could fix the issue",
      "time_estimate": "2 min",
      "risk": "none|low|medium",
      "success_indicator": "How you know it worked"
    }
  ],
  "do_not_do": [
    "Specific action to avoid that could make things worse or complicate the agent's fix"
  ],
  "escalate_if": "condition under which they should stop trying and wait for the agent",
  "useful_links": [
    {"label": "link label", "url": "real URL if applicable or null"}
  ]
}"""


SELF_HELP_FALLBACK: dict[str, dict] = {
    "vpn": {
        "summary": "VPN connectivity issue — usually fixed by a client restart or network switch.",
        "likely_solution": None,
        "steps": [
            {"order": 1, "title": "Restart VPN client",       "instruction": "Fully quit (check system tray) and reopen your VPN application, then reconnect", "time_estimate": "1 min",  "risk": "none", "success_indicator": "VPN connects and shows a green/connected status"},
            {"order": 2, "title": "Flush DNS cache",          "instruction": "Open Command Prompt as Administrator and run: ipconfig /flushdns, then retry",     "time_estimate": "2 min",  "risk": "low",  "success_indicator": "VPN connects successfully after the flush"},
            {"order": 3, "title": "Switch network",           "instruction": "Disconnect from current WiFi and connect via mobile hotspot, then retry VPN",       "time_estimate": "2 min",  "risk": "none", "success_indicator": "VPN connects on the alternate network — confirms ISP/firewall issue"},
            {"order": 4, "title": "Reset adapter",            "instruction": "Settings → Network → disable then re-enable your network adapter, then reconnect", "time_estimate": "2 min",  "risk": "low",  "success_indicator": "VPN handshake completes without timeout"},
        ],
        "do_not_do": [
            "Don't uninstall/reinstall the VPN client — this can wipe saved configuration profiles the agent would need",
            "Don't repeatedly mash 'connect' — some VPN servers temporarily lock accounts after rapid failed attempts",
        ],
        "escalate_if": "VPN still fails after a network switch — this points to a server-side or account issue the agent must fix.",
    },
    "password": {
        "summary": "Account access issue — most password problems are fixed by self-service reset or a cache clear.",
        "likely_solution": "If you have access to your recovery email or phone, use the self-service password reset link on the login page — this resolves most lockouts within minutes without needing IT.",
        "steps": [
            {"order": 1, "title": "Use self-service reset",   "instruction": "Click 'Forgot password' on the login page and follow the email/SMS verification flow", "time_estimate": "3 min",  "risk": "none", "success_indicator": "You receive a reset link and can set a new password"},
            {"order": 2, "title": "Check Caps Lock / keyboard","instruction": "Confirm Caps Lock is off and type your password into a text editor first to verify it's correct", "time_estimate": "30 sec", "risk": "none", "success_indicator": "Password matches what you intended to type"},
            {"order": 3, "title": "Try a private window",     "instruction": "Open an incognito/private browser window and attempt login there",                 "time_estimate": "1 min",  "risk": "none", "success_indicator": "Login succeeds — confirms a saved-cookie/cache issue"},
            {"order": 4, "title": "Clear saved credentials",  "instruction": "Clear browser cookies/cache for this site, then retry login with the correct password", "time_estimate": "2 min", "risk": "low",  "success_indicator": "Login page accepts the credentials"},
        ],
        "do_not_do": [
            "Don't attempt more than 3-5 logins in a row — most systems lock the account after repeated failures, which makes the IT fix slower",
            "Don't share your password over chat/email even to a colleague trying to help",
        ],
        "escalate_if": "Self-service reset email/SMS never arrives after 5 minutes, or the account shows as locked — this needs an IT-side unlock.",
    },
    "laptop": {
        "summary": "Device performance/hardware issue — often resolved by freeing resources or a clean restart.",
        "likely_solution": None,
        "steps": [
            {"order": 1, "title": "Close high-usage apps",    "instruction": "Press Ctrl+Shift+Esc, sort by CPU/Memory, and close anything you don't need running", "time_estimate": "2 min",  "risk": "low",  "success_indicator": "CPU usage drops below 50% and the system feels more responsive"},
            {"order": 2, "title": "Restart (not sleep)",      "instruction": "Save your work, then Start → Power → Restart (a full restart, not sleep/hibernate)",   "time_estimate": "3 min",  "risk": "none", "success_indicator": "Issue doesn't reappear after the restart"},
            {"order": 3, "title": "Free disk space",          "instruction": "Open Settings → System → Storage → Temporary files, and delete temp/cache files",     "time_estimate": "5 min",  "risk": "low",  "success_indicator": "Free space above 10% of total drive capacity"},
            {"order": 4, "title": "Check battery/power mode", "instruction": "If on battery, switch to 'Best Performance' power mode in Settings → Power",          "time_estimate": "1 min",  "risk": "none", "success_indicator": "Performance improves immediately on plugged-in/best-performance mode"},
        ],
        "do_not_do": [
            "Don't run a full disk check (chkdsk) or factory reset — this can take hours and may need IT supervision",
            "Don't install random 'PC cleaner' tools from the internet — some are malware",
        ],
        "escalate_if": "Performance doesn't improve after closing apps and restarting, or the laptop shows hardware warnings/blue screens.",
    },
    "leave": {
        "summary": "Leave request or policy question — many of these can be answered immediately from standard policy.",
        "likely_solution": "Standard leave process: submit your request through the HR portal at least 2 weeks in advance for planned leave, and notify your direct manager so coverage can be arranged. Most companies grant 15-25 annual leave days, accrued monthly — check 'My Leave' in the portal for your exact balance. Sick leave usually doesn't require advance notice but does need a same-day notification to your manager.",
        "steps": [
            {"order": 1, "title": "Check the HR portal",      "instruction": "Log into the HR portal → My Leave → check your current balance and submit directly if possible", "time_estimate": "2 min", "risk": "none", "success_indicator": "Request submitted or balance confirmed without waiting for the agent"},
            {"order": 2, "title": "Notify your manager now",  "instruction": "Send your manager a quick message with your planned dates so planning isn't delayed",  "time_estimate": "2 min",  "risk": "none", "success_indicator": "Manager acknowledges — your dates are on their radar regardless of ticket status"},
        ],
        "do_not_do": [
            "Don't submit the same leave request multiple times — duplicate requests can cause confusion in the approval workflow",
            "Don't book non-refundable travel until the leave is formally approved",
        ],
        "escalate_if": "The HR portal shows an error, your balance looks incorrect, or this involves a special leave type (maternity/paternity/medical) needing documentation.",
    },
    "expense": {
        "summary": "Expense claim issue — most rejections are due to missing receipts or wrong category.",
        "likely_solution": "Common reasons claims get rejected: missing/illegible receipts, the wrong expense category selected, or the amount exceeding the per-item policy limit (commonly client meals are capped around R500-R1000 depending on company policy). Check these three things first — if all are correct, the agent will need to review the specific rejection reason.",
        "steps": [
            {"order": 1, "title": "Verify receipts attached", "instruction": "Open the claim and confirm every line item has a clear, itemised receipt attached", "time_estimate": "2 min", "risk": "none", "success_indicator": "All receipts visible and legible in the claim"},
            {"order": 2, "title": "Check category & limits",  "instruction": "Confirm the expense category matches the policy and the amount is within the per-item limit", "time_estimate": "2 min", "risk": "none", "success_indicator": "Category and amount both align with policy"},
            {"order": 3, "title": "Resubmit if you find the issue", "instruction": "If a receipt was missing/wrong category, correct it and resubmit through the portal directly", "time_estimate": "3 min", "risk": "none", "success_indicator": "Claim status changes to 'Pending Review' again"},
        ],
        "do_not_do": [
            "Don't submit a duplicate claim alongside the rejected one — this creates double-entries Finance has to manually reconcile",
        ],
        "escalate_if": "Receipts, category, and amount all look correct but the claim is still rejected — this needs Finance to check the system-side reason.",
    },
    "email": {
        "summary": "Email/Outlook sync issue — usually fixed by an app restart or reconnecting the account.",
        "likely_solution": None,
        "steps": [
            {"order": 1, "title": "Restart Outlook fully",    "instruction": "Close Outlook completely (check it's not in the system tray), then reopen it", "time_estimate": "1 min", "risk": "none", "success_indicator": "Inbox refreshes and new emails appear"},
            {"order": 2, "title": "Check account status",     "instruction": "File → Account Settings → confirm your account shows 'Connected', not 'Disconnected'", "time_estimate": "1 min", "risk": "none", "success_indicator": "Status reads Connected"},
            {"order": 3, "title": "Check webmail access",     "instruction": "Try logging into the webmail (browser) version with the same credentials",       "time_estimate": "2 min", "risk": "none", "success_indicator": "Webmail works — confirms the issue is local to the Outlook app, not the account"},
        ],
        "do_not_do": [
            "Don't delete and recreate the email account in Outlook — this can cause local data/rules to be lost",
        ],
        "escalate_if": "Webmail also fails, or your account shows as locked/disabled — this is an account-level issue for IT.",
    },
    "printer": {
        "summary": "Printer issue — clearing the queue or restarting the printer fixes most jams/offline errors.",
        "likely_solution": None,
        "steps": [
            {"order": 1, "title": "Restart the printer",      "instruction": "Power the printer off, wait 10 seconds, then power it back on and wait for it to be ready", "time_estimate": "2 min", "risk": "none", "success_indicator": "Printer status light turns solid (not blinking/error)"},
            {"order": 2, "title": "Clear the print queue",    "instruction": "Settings → Printers & Scanners → open the printer → cancel all pending print jobs", "time_estimate": "2 min", "risk": "none", "success_indicator": "Queue shows empty, no stuck jobs"},
            {"order": 3, "title": "Re-send the print job",    "instruction": "After clearing the queue and confirming the printer is ready, send your document again", "time_estimate": "1 min", "risk": "none", "success_indicator": "Document prints successfully"},
        ],
        "do_not_do": [
            "Don't keep clicking 'Print' repeatedly on a stuck job — this stacks up the queue and makes it harder to clear",
            "Don't open the printer and pull out paper unless you can see exactly where it's jammed — this can damage the rollers",
        ],
        "escalate_if": "Printer still shows offline/error after a restart and queue clear, or there's a visible paper jam you can't safely remove.",
    },
    "facilities": {
        "summary": "Facilities/maintenance issue — safety-relevant issues should be flagged immediately to reception/security.",
        "likely_solution": None,
        "steps": [
            {"order": 1, "title": "Assess if it's a safety risk", "instruction": "If there's any risk of injury (broken glass, exposed wiring, sharp edges), move away from the area now", "time_estimate": "1 min", "risk": "none", "success_indicator": "You and others are at a safe distance"},
            {"order": 2, "title": "Use a temporary alternative", "instruction": "If possible, relocate to another desk/meeting room while this one is fixed", "time_estimate": "2 min", "risk": "none", "success_indicator": "You can continue working without disruption"},
        ],
        "do_not_do": [
            "Don't attempt to repair electrical, hydraulic, or structural issues yourself",
            "Don't continue using broken equipment (e.g. a chair with a failed hydraulic) — this risks injury",
        ],
        "escalate_if": "This is a safety hazard — contact reception or security immediately rather than waiting for the ticket.",
    },
    "automation": {
        "summary": "Workflow/automation failure — check whether the trigger conditions were actually met before assuming it's broken.",
        "likely_solution": None,
        "steps": [
            {"order": 1, "title": "Re-check trigger conditions", "instruction": "Confirm the action that should have triggered the workflow was completed correctly (e.g. form fully submitted, correct status set)", "time_estimate": "2 min", "risk": "none", "success_indicator": "Trigger conditions confirmed as met"},
            {"order": 2, "title": "Check for a delay",        "instruction": "Some scheduled workflows run on a delay (e.g. hourly/nightly) — wait one cycle and check again", "time_estimate": "5 min", "risk": "none", "success_indicator": "Workflow completes on its next scheduled run"},
            {"order": 3, "title": "Note exact timestamps",    "instruction": "Write down when the trigger action happened and when you expected the workflow to run — the agent will need this", "time_estimate": "1 min", "risk": "none", "success_indicator": "Timestamps ready to share with the agent"},
        ],
        "do_not_do": [
            "Don't repeat the triggering action multiple times — this can create duplicate workflow runs once the automation is fixed",
            "Don't manually perform the steps the workflow should do — this can conflict with the automation when it catches up",
        ],
        "escalate_if": "The trigger conditions were definitely met and a full scheduled cycle has passed with no result — this is a genuine automation failure.",
    },
    "general": {
        "summary": "General issue — a restart resolves many common problems, but check the details below first.",
        "likely_solution": None,
        "steps": [
            {"order": 1, "title": "Restart the affected system", "instruction": "Save your work and do a full restart of the affected application or device", "time_estimate": "3 min", "risk": "none", "success_indicator": "Issue doesn't reappear after restart"},
            {"order": 2, "title": "Note exact error details",  "instruction": "Write down the exact error message, when it started, and what you were doing — this speeds up the agent's fix", "time_estimate": "1 min", "risk": "none", "success_indicator": "Details ready to share, agent can act faster"},
        ],
        "do_not_do": [
            "Don't repeat the action that caused the error multiple times — this can make logs harder to read for the agent",
        ],
        "escalate_if": "The issue is blocking your work entirely or involves data loss/security — flag this as urgent rather than waiting.",
    },
}


async def generate_self_help(
    title: str,
    description: str,
    category: str,
    department: str,
    priority: str,
) -> dict:
    """
    Generate self-help steps the employee can try immediately while waiting.
    Uses GROQ for context-aware steps, falls back to keyword-matched templates.
    """
    if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("gsk_your"):
        try:
            from groq import AsyncGroq
            groq = AsyncGroq(api_key=settings.GROQ_API_KEY)
            response = await groq.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": SELF_HELP_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"TICKET TITLE: {title}\n"
                            f"EMPLOYEE DESCRIPTION: {description}\n\n"
                            f"Context — Department: {department} | Category: {category} | Priority: {priority}\n\n"
                            f"Using ONLY the specific problem described above (not a generic version of it), "
                            f"generate self-help steps tailored exactly to what this employee said. "
                            f"The steps must reference the actual problem: '{title}'. "
                            f"Do not give generic steps that would apply to any ticket."
                        ),
                    },
                ],
                temperature=0.3,
                max_tokens=1500,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            result["generated_by"] = "groq"
            result["enabled"] = True
            return result
        except Exception as e:
            print(f"[SelfHelp] GROQ failed: {e} — using fallback")

    # Keyword fallback
    text = (title + " " + description + " " + category).lower()
    key = "general"
    for k, matches in [
        ("vpn",        ["vpn", "remote access", "network connect"]),
        ("password",   ["password", "login", "locked out", "can't log in", "cannot log in", "access denied"]),
        ("automation", ["workflow", "automation", "scheduled job", "integration", "approval flow"]),
        ("laptop",     ["laptop", "computer", "pc ", "slow", "freezing", "crash",
                         "projector", "monitor", "screen", "tv", "hdmi", "webcam",
                         "speaker", "microphone", "dock", "docking station"]),
        ("leave",      ["leave", "vacation", "annual leave", "sick leave", "time off", "pto"]),
        ("expense",    ["expense", "reimbursement", "claim", "receipt"]),
        ("email",      ["email", "outlook", "inbox", "mailbox"]),
        ("printer",    ["printer", "printing", "print job"]),
        ("facilities", ["facilities", "office", "chair", "desk", "building", "maintenance"]),
    ]:
        if any(m in text for m in matches):
            key = k
            break

    tpl = SELF_HELP_FALLBACK[key]
    return {
        "enabled":          True,
        "can_self_resolve": key != "general",
        "confidence":       0.70,
        "summary":          tpl["summary"],
        "likely_solution":  tpl.get("likely_solution"),
        "steps":            tpl["steps"],
        "do_not_do":        tpl.get("do_not_do", []),
        "escalate_if":      tpl["escalate_if"],
        "useful_links":     [],
        "generated_by":     "template",
    }
