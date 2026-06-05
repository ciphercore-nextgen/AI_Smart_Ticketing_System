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
