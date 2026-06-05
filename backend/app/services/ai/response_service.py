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
        "ai_intern":             "You are an AI Intern handling HR and people operations queries.",
        "it_support_technician": "You are an IT Support Technician handling technical and financial system issues.",
        "junior_operations":     "You are a Junior Operations Agent handling facilities, logistics, and procurement.",
        "admin":                 "You are a Support Manager with full visibility across all departments.",
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

SELF_HELP_SYSTEM_PROMPT = """You are TicketIQ's self-help engine for enterprise employees.

A support ticket was just submitted. Your job is to give the employee
3–5 practical things they can try RIGHT NOW while waiting for the agent.

RULES:
1. Be specific to their exact problem — no generic advice
2. Each step must be immediately actionable (no "contact IT" — they already did)
3. Order by easiest/fastest first
4. If a step is risky (e.g. reinstall), flag it with a warning
5. Include an estimated time for each step e.g. "2 min"
6. Keep each step under 20 words
7. Add a "success indicator" — how they'll know if it worked

Respond ONLY with valid JSON:
{
  "can_self_resolve": true/false,
  "confidence": 0.0-1.0,
  "summary": "one sentence: what this problem likely is",
  "steps": [
    {
      "order": 1,
      "title": "Short action title",
      "instruction": "Exact step to take",
      "time_estimate": "2 min",
      "risk": "none|low|medium",
      "success_indicator": "How you know it worked"
    }
  ],
  "escalate_if": "condition under which they should not wait and escalate immediately",
  "useful_links": [
    {"label": "link label", "url": "real URL if applicable or null"}
  ]
}"""


SELF_HELP_FALLBACK: dict[str, list[dict]] = {
    "vpn": [
        {"order": 1, "title": "Restart VPN client",          "instruction": "Fully quit and reopen your VPN application",                       "time_estimate": "1 min",  "risk": "none",   "success_indicator": "VPN connects and shows green status"},
        {"order": 2, "title": "Check internet connection",    "instruction": "Open a browser and go to google.com to confirm internet works",     "time_estimate": "30 sec", "risk": "none",   "success_indicator": "Page loads normally"},
        {"order": 3, "title": "Switch network",               "instruction": "Try connecting from a different WiFi network or mobile hotspot",    "time_estimate": "2 min",  "risk": "none",   "success_indicator": "VPN connects on alternate network"},
        {"order": 4, "title": "Flush DNS cache",              "instruction": "Run: ipconfig /flushdns in Command Prompt as Administrator",        "time_estimate": "2 min",  "risk": "low",    "success_indicator": "VPN connects after DNS flush"},
        {"order": 5, "title": "Check VPN server status",      "instruction": "Ask a colleague if their VPN is working — may be a server issue",  "time_estimate": "1 min",  "risk": "none",   "success_indicator": "Colleague confirms same issue = server side"},
    ],
    "password": [
        {"order": 1, "title": "Try password reset portal",    "instruction": "Go to your company's self-service password reset portal",          "time_estimate": "3 min",  "risk": "none",   "success_indicator": "New password works on login"},
        {"order": 2, "title": "Check CAPS LOCK",              "instruction": "Ensure Caps Lock is off and try your password again",              "time_estimate": "30 sec", "risk": "none",   "success_indicator": "Login succeeds"},
        {"order": 3, "title": "Try Incognito window",         "instruction": "Open a private/incognito browser window and try logging in",       "time_estimate": "1 min",  "risk": "none",   "success_indicator": "Login succeeds in private window"},
        {"order": 4, "title": "Clear browser cache",          "instruction": "Press Ctrl+Shift+Delete → clear cookies and cache → retry login",  "time_estimate": "2 min",  "risk": "low",    "success_indicator": "Login page refreshes and works"},
    ],
    "laptop": [
        {"order": 1, "title": "Restart your laptop",          "instruction": "Save all work, then do a full restart (not sleep/hibernate)",       "time_estimate": "3 min",  "risk": "none",   "success_indicator": "Issue doesn't reappear after restart"},
        {"order": 2, "title": "Free up disk space",           "instruction": "Open File Explorer → right-click C: drive → Properties → Disk Cleanup", "time_estimate": "5 min", "risk": "low", "success_indicator": "Storage below 90%, laptop runs faster"},
        {"order": 3, "title": "Close background apps",        "instruction": "Press Ctrl+Shift+Esc → end tasks using high CPU/memory",           "time_estimate": "2 min",  "risk": "low",    "success_indicator": "CPU usage drops below 50%"},
        {"order": 4, "title": "Check for Windows updates",    "instruction": "Settings → Windows Update → check for pending updates",            "time_estimate": "5 min",  "risk": "low",    "success_indicator": "No pending updates blocking performance"},
    ],
    "leave": [
        {"order": 1, "title": "Check HR portal first",        "instruction": "Log into the HR portal and check if leave can be submitted directly", "time_estimate": "2 min", "risk": "none",  "success_indicator": "Leave request submitted without agent help"},
        {"order": 2, "title": "Check leave balance",          "instruction": "In the HR portal → My Leave → check your current balance",          "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Balance confirmed before agent reviews"},
        {"order": 3, "title": "Notify your manager directly", "instruction": "Email your direct manager about the planned leave dates now",        "time_estimate": "2 min",  "risk": "none",  "success_indicator": "Manager acknowledged — process can proceed"},
    ],
    "expense": [
        {"order": 1, "title": "Check receipts are attached",  "instruction": "Open your expense claim and verify all receipts are uploaded",       "time_estimate": "2 min",  "risk": "none",  "success_indicator": "All receipts visible in the claim"},
        {"order": 2, "title": "Check claim amount limits",    "instruction": "Review the expense policy for per-item and daily limits",            "time_estimate": "2 min",  "risk": "none",  "success_indicator": "Claim is within policy limits"},
        {"order": 3, "title": "Verify expense category",      "instruction": "Ensure the correct expense category is selected on the claim",       "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Category matches the type of expense"},
    ],
    "email": [
        {"order": 1, "title": "Check email server status",    "instruction": "Ask a colleague if their email is working",                         "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Colleague confirms same issue = server side"},
        {"order": 2, "title": "Restart Outlook",              "instruction": "Fully close Outlook (check system tray) and reopen it",             "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Emails load and sync normally"},
        {"order": 3, "title": "Check account settings",       "instruction": "File → Account Settings → verify your account shows Connected",     "time_estimate": "2 min",  "risk": "none",  "success_indicator": "Account status shows Connected"},
        {"order": 4, "title": "Clear Outlook cache",          "instruction": "Close Outlook → delete OST file in AppData → reopen Outlook",       "time_estimate": "10 min", "risk": "medium","success_indicator": "Outlook rebuilds and syncs successfully"},
    ],
    "printer": [
        {"order": 1, "title": "Restart printer",              "instruction": "Turn printer off, wait 10 seconds, turn back on",                   "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Printer ready light is solid green"},
        {"order": 2, "title": "Clear print queue",            "instruction": "Settings → Printers → right-click printer → See what's printing → cancel all", "time_estimate": "2 min", "risk": "none", "success_indicator": "Print queue is empty"},
        {"order": 3, "title": "Reconnect to printer",         "instruction": "Settings → Printers → remove printer → Add a printer → re-add it", "time_estimate": "3 min",  "risk": "low",   "success_indicator": "Test page prints successfully"},
    ],
    "facilities": [
        {"order": 1, "title": "Check if others affected",     "instruction": "Ask nearby colleagues if they have the same issue",                  "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Determine if it's isolated or widespread"},
        {"order": 2, "title": "Document the issue",           "instruction": "Take a photo of the problem to share with the agent",               "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Photo ready to attach to ticket"},
        {"order": 3, "title": "Check if safety risk",         "instruction": "If it's a safety hazard, contact reception or security immediately", "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Safety issue escalated to correct team"},
    ],
    "general": [
        {"order": 1, "title": "Restart the affected system",  "instruction": "A full restart resolves many common issues",                        "time_estimate": "3 min",  "risk": "none",  "success_indicator": "Issue doesn't reappear after restart"},
        {"order": 2, "title": "Check for known outages",      "instruction": "Ask a colleague if they have the same issue",                       "time_estimate": "1 min",  "risk": "none",  "success_indicator": "Determine if issue is widespread"},
        {"order": 3, "title": "Document the error",           "instruction": "Take a screenshot of any error messages before they disappear",     "time_estimate": "30 sec", "risk": "none",  "success_indicator": "Error captured and ready to share with agent"},
    ],
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
                            f"Department: {department}\n"
                            f"Category: {category}\n"
                            f"Priority: {priority}\n"
                            f"Title: {title}\n\n"
                            f"Description:\n{description}"
                        ),
                    },
                ],
                temperature=0.2,
                max_tokens=800,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            result["generated_by"] = "groq"
            return result
        except Exception as e:
            print(f"[SelfHelp] GROQ failed: {e} — using fallback")

    # Keyword fallback
    text = (title + " " + description + " " + category).lower()
    key = "general"
    for k in ["vpn", "password", "laptop", "leave", "expense", "email", "printer", "facilities"]:
        if k in text:
            key = k
            break

    return {
        "can_self_resolve": key != "general",
        "confidence":       0.70,
        "summary":          f"Common {category} issue — try these steps while your ticket is being reviewed.",
        "steps":            SELF_HELP_FALLBACK[key],
        "escalate_if":      "Issue involves data loss, security breach, or complete work blockage",
        "useful_links":     [],
        "generated_by":     "template",
    }
