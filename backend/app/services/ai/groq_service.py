"""
TicketIQ — AI Classification & Agent Routing
=============================================
Routing is governed by the Enterprise Simulation Rules document.

THREE AGENTS, STRICT SCOPES:
  it_support_technician  — passwords, devices, access, connectivity, hardware/software
  ai_intern              — reports, data analysis, dashboards, research, documentation
  junior_operations      — workflow failures, automation, scheduled jobs, integrations

FOUR DEPARTMENTS (submit only — never resolve):
  HR, IT, Finance, Operations

TWO-STAGE PROCESS:
  Stage 1 — classify the ticket (department, priority, category, tokens)
  Stage 2 — select the agent whose scope matches the ticket's required expertise
"""

import json
import math
from typing import Optional
from groq import AsyncGroq
from app.core.config import settings, AGENT_SKILL_PROFILES


client: Optional[AsyncGroq] = None


def get_groq_client() -> AsyncGroq:
    global client
    if client is None:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    return client


# ─── Stage 1: Classification Prompt ──────────────────────────────────────────

CLASSIFICATION_PROMPT = """You are TicketIQ's ticket analysis engine for an enterprise service desk.

Your job is to classify the ticket and extract skill tokens that describe the
EXPERTISE needed to resolve it — not which department submitted it.

SUBMITTING DEPARTMENTS: hr | it | finance | operations
(These departments only SUBMIT tickets. They do not resolve them.)

RESOLVING AGENTS and their scopes:

1. it_support_technician
   Handles: password resets, account lockouts, email access, printer problems,
   VPN issues, software installation, laptop/desktop troubleshooting, Wi-Fi,
   user permissions, Microsoft 365, hardware, new employee device setup.
   Does NOT own anything related to AI tools/chatbots — that is the AI Intern's
   domain end-to-end (see below).
   Skill tokens: password, password_reset, account_lockout, login, authentication,
   2fa, mfa, account, access, permission, email, outlook, microsoft_365, teams,
   vpn, network, wifi, internet, connectivity, laptop, computer, hardware, device,
   printer, software, installation, install, update, crash, bug, error, system,
   shared_drive, new_employee_setup, device_onboarding, cybersecurity, backup

2. ai_intern
   Handles: data analysis, report generation, dashboard assistance, research,
   knowledge base creation, document summarization, trend analysis, FAQ generation,
   business intelligence, data cleaning, AI-powered insights.
   ALSO owns the company's AI tooling end-to-end — both USING it and FIXING it:
     - "Help me use AI to analyse data / generate a report / summarise a document"
     - "The AI chatbot / Copilot / AI assistant is not responding / not loading / broken / giving errors"
     - "Can't access the AI tool", "AI chat keeps crashing", "AI assistant is down"
   In a real company, the team that runs the AI tooling is the first point of
   contact for ANY problem with that tooling — whether it's "how do I use this"
   or "this isn't working". They triage: simple fixes get handled directly,
   deeper infrastructure issues get escalated internally (still their ticket).
   Skill tokens: report, reporting, data_analysis, analysis, analytics, dashboard,
   trend_analysis, trends, insights, business_intelligence, data_cleaning,
   document_summary, summarize, faq, knowledge_base, research, documentation,
   employee_turnover, monthly_report, quarterly_report, survey_analysis,
   support_trends, ticket_analytics, performance_report, financial_report,
   operational_report, hr_report, ai_insights, ai_assistance, ai_powered_analysis,
   ai_powered_report, ai_recommendation, ai_summary, content_generation,
   text_analysis, sentiment_analysis, data_extraction, intelligent_search,
   ai_tool, ai_chatbot, ai_assistant, ai_tool_error, ai_tool_down,
   ai_tool_not_responding, copilot, chatbot_error, ai_outage, ai_access

3. junior_operations
   Handles: workflow failures, process automation issues, scheduled job failures,
   integration problems, approval workflow failures, notification failures,
   onboarding/offboarding workflow failures, low-code/no-code platform issues.
   Skill tokens: workflow, workflow_failure, automation, automation_failure,
   process_automation, scheduled_job, scheduled_task, job_failure, integration,
   integration_failure, notification_failure, approval_workflow, leave_workflow,
   finance_workflow, ticket_workflow, escalation_automation, low_code, no_code,
   power_automate, erp_workflow, provisioning_failure, onboarding_workflow

CRITICAL DISAMBIGUATION RULES — apply before assigning tokens:

STEP 0 — IS THIS EVEN A LEGITIMATE SUPPORT REQUEST?
Before routing anywhere, check whether this is a genuine workplace IT/HR/Finance/
Operations issue at all. It is NOT a legitimate request if it's: general trivia or
knowledge questions unrelated to work ("what colour is the sky", "who won the
world cup"), a joke, a test/placeholder submission, or any question with no
actual workplace problem to solve. Genuine requests — even vague, casual, or
oddly-phrased ones — about something work-related (a tool, a process, a benefit,
a payment, equipment, access, a workflow) ARE legitimate, even if the employee
didn't name a specific system. When genuinely unsure, default to legitimate —
only reject things that are CLEARLY unrelated to work. If illegitimate, set
"is_support_request": false and explain briefly in "rejection_reason"; you can
skip the remaining routing steps in that case (department/priority can be your
best guess, they won't be used).

STEP 1 — AI TOOLING CHECK (check this first, only if ticket explicitly names an AI product):
Only route to ai_intern if the ticket contains one of these EXACT phrases or named products:
  "AI chatbot", "AI tool", "AI assistant", "AI chat", "Copilot", "ChatGPT", "GPT",
  "OpenAI", "LLM", "AI bot", "artificial intelligence", "the AI", "our AI".
  Examples that qualify:
    - "The AI chatbot is not responding" → ai_intern
    - "Copilot keeps crashing" → ai_intern
    - "Help me use AI to generate a report" → ai_intern
    - "Can't access the AI tool" → ai_intern
  Examples that do NOT qualify (no explicit AI product mentioned):
    - "My PC froze" → it_support_technician (PC is a device, not an AI tool)
    - "My computer crashed" → it_support_technician
    - "Software not loading" → it_support_technician
    - "I can't access my account" → it_support_technician (access = login issue)
    - "System is slow" → it_support_technician

STEP 2 — DEVICE / HARDWARE / SOFTWARE TICKETS (no AI product mentioned):
Any ticket about a physical device, non-AI software, or IT access:
  "PC", "computer", "laptop", "freezing", "crashed", "slow", "won't start",
  "blue screen", "printer", "VPN", "password", "email", "Outlook", "Teams",
  "software install", "account locked", "can't login", "screen", "keyboard",
  "mouse", "monitor", "WiFi", "network", "storage", "hard drive"
  → it_support_technician. Always. Even if the word "AI" appears elsewhere
  in the company name or unrelated context.

STEP 3 — WORKFLOW / AUTOMATION TICKETS (no AI product mentioned):
Route to junior_operations ONLY when a named BUSINESS WORKFLOW or SCHEDULED JOB
is broken: "leave approval flow", "cron job failed", "Power Automate", "scheduled task",
"onboarding workflow", "integration not triggering". Generic "it stopped working"
without naming a workflow → it_support_technician.

STEP 4 — DATA / REPORTING (no AI product, no device, no workflow):
Requests for analysis, reports, dashboards, summaries → ai_intern.

PRIORITY RULES:
CRITICAL (4hr SLA): system/server down, data breach, security incident, payroll not processed,
  entire team blocked, production outage, safety hazard, emergency
HIGH (24hr SLA): blocking one person's work, deadline today, client presentation,
  email/VPN down for remote worker, wrong payslip, multiple people affected
MEDIUM (3 days): standard single-person request, can work around it temporarily
LOW (1 week): non-urgent, nice-to-have, future planning, distant leave request

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "is_support_request": <true|false>,
  "rejection_reason": "<one sentence, only if is_support_request is false>",
  "department_slug": "<hr|it|finance|operations>",
  "department_name": "<full name>",
  "priority": "<critical|high|medium|low>",
  "category": "<specific sub-category, e.g. 'Password Reset', 'Report Generation', 'Workflow Failure'>",
  "sentiment": "<positive|neutral|frustrated|urgent>",
  "summary": "<one sentence: what does the employee need?>",
  "priority_reason": "<one sentence: why this priority?>",
  "skill_tokens": ["<token1>", "<token2>", ...],
  "token_weights": {"<token>": <1-3>, ...}
}

token_weights: 1 = loosely relevant, 2 = relevant, 3 = core skill required.
Extract 3–10 tokens. Only tokens that describe the EXPERTISE needed, not the department."""


# ─── Stage 2: Agent Selection Prompt ─────────────────────────────────────────

AGENT_SELECTION_PROMPT = """You are TicketIQ's agent assignment engine.

STRICT ENTERPRISE RULES — agents have fixed scopes:

IT Support Assistant: handles IT problems — passwords, devices, access,
  hardware, software, email, VPN, printers, network. NOT data analysis, NOT HR.
  Does NOT own AI tooling — see AI Intern below. If a ticket mentions any AI
  tool/chatbot/Copilot/etc., it is NEVER assigned here, even if it "sounds IT".

AI Intern: handles data/reporting/analysis work — reports, dashboards,
  research, documentation, summaries, FAQs, trend analysis.
  ALSO owns the company's AI tooling completely — both helping employees USE
  AI tools AND fixing/triaging when those AI tools break or misbehave.
  NOT general IT support, NOT HR policy, NOT non-AI software/hardware.

Junior Automation Support: handles workflow and automation failures —
  broken workflows, failed scheduled jobs, integration errors, automation bugs.
  NOT passwords, NOT data analysis, NOT hardware, NOT broken apps or software,
  NOT AI tooling (even "AI automation" issues go to AI Intern — see below).

ROUTING DECISION TREE — follow these steps in order:

STEP 1: Does the ticket explicitly name an AI product?
  ("AI chatbot", "AI tool", "AI assistant", "Copilot", "ChatGPT", "GPT", "our AI", "the AI")
  YES → AI Intern (they own AI tooling end-to-end: usage help AND technical issues)
  NO  → continue to Step 2

STEP 2: Is it about a physical device, non-AI software, or IT access?
  (PC, computer, laptop, phone, printer, freezing, crash, slow, VPN, password,
   email, Outlook, Teams, account locked, can't login, WiFi, screen, keyboard,
   storage, network, software install, hardware)
  YES → IT Support Assistant
  NO  → continue to Step 3

STEP 3: Is it about a named business workflow, scheduled job, or automation pipeline?
  (leave approval flow, cron job, Power Automate flow, onboarding workflow,
   scheduled task, integration not triggering, approval emails not sending)
  YES → Junior Automation Support
  NO  → continue to Step 4

STEP 4: Is it a data/reporting/analysis request?
  (generate a report, analyse data, dashboard, summarise, research, trends, FAQ)
  YES → AI Intern
  NO  → IT Support Assistant (default for anything unclassified)

CONCRETE EXAMPLES:
✓ "My PC froze" → IT Support Assistant (PC = device, Step 2)
✓ "My computer crashed" → IT Support Assistant (computer = device, Step 2)
✓ "VPN not connecting" → IT Support Assistant (VPN = IT access, Step 2)
✓ "I can't log in" → IT Support Assistant (login = IT access, Step 2)
✓ "The AI chatbot is not responding" → AI Intern (names AI chatbot, Step 1)
✓ "Copilot keeps crashing" → AI Intern (names Copilot, Step 1)
✓ "Help me use AI to generate a report" → AI Intern (names AI, Step 1)
✓ "Leave approval workflow stopped" → Junior Automation Support (named workflow, Step 3)
✓ "Generate a sales report" → AI Intern (data request, Step 4)
✓ "Software not loading" → IT Support Assistant (non-AI software, Step 2)

Match ticket skill_tokens to agent scope strictly. Prefer the agent whose
PRIMARY expertise covers the core problem, not the submitting department.

Respond ONLY with valid JSON:
{
  "selected_agent_id": "<agent_id>",
  "selection_confidence": <0.0-1.0>,
  "routing_rationale": "<one sentence: why this agent for this specific problem>",
  "token_match_score": <0-100>
}"""


async def classify_ticket(title: str, description: str) -> dict:
    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        result = _fallback_classify(title, description)
    else:
        try:
            groq = get_groq_client()
            response = await groq.chat.completions.create(
                model=settings.GROQ_CLASSIFICATION_MODEL,
                messages=[
                    {"role": "system", "content": CLASSIFICATION_PROMPT},
                    {"role": "user",   "content": f"Title: {title}\n\nDescription: {description}"},
                ],
                temperature=0.05,
                max_tokens=600,
                response_format={"type": "json_object"},
            )

            result = json.loads(response.choices[0].message.content)

            valid_slugs = {"hr", "it", "finance", "operations"}
            if result.get("department_slug") not in valid_slugs:
                result["department_slug"] = _keyword_dept(title + " " + description)
                result["department_name"] = {
                    "hr": "Human Resources", "it": "Information Technology",
                    "finance": "Finance", "operations": "Operations",
                }.get(result["department_slug"], "Information Technology")

            if result.get("priority") not in {"critical", "high", "medium", "low"}:
                result["priority"] = "medium"

            if not isinstance(result.get("is_support_request"), bool):
                result["is_support_request"] = True  # fail-open: malformed field shouldn't block a real ticket

            if not isinstance(result.get("skill_tokens"), list):
                result["skill_tokens"] = _extract_fallback_tokens(title + " " + description)

            if not isinstance(result.get("token_weights"), dict):
                result["token_weights"] = {t: 2 for t in result["skill_tokens"]}

            result["classified_by"] = "groq_tokenized"

        except Exception as e:
            print(f"[GROQ Stage1] Classification failed: {e}")
            result = _fallback_classify(title, description)

    # Applies regardless of which path produced `result` — the AI (or its
    # fallback) might miss explicit urgency language the employee used, so
    # this is a deterministic safety net on top, not a replacement for it.
    _apply_urgency_override(title, description, result)
    return result


async def select_agent_for_ticket(
    ticket_tokens: list[str],
    token_weights: dict[str, int],
    agents: list[dict],
    ticket_title: str = "",
    ticket_description: str = "",
) -> dict:
    if not agents:
        return {"selected_agent_id": None, "routing_rationale": "No agents available", "selection_confidence": 0}

    python_scores = _score_agents_by_tokens(ticket_tokens, token_weights, agents)
    best_by_tokens = max(python_scores, key=lambda x: x["score"])

    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        token_id = best_by_tokens["agent_id"]
        override = _deterministic_override(ticket_title, ticket_description, token_id, agents)
        return {
            "selected_agent_id":    override or token_id,
            "routing_rationale":    best_by_tokens["rationale"],
            "selection_confidence": min(best_by_tokens["score"] / 30.0, 0.95),
            "token_match_score":    best_by_tokens["score"],
            "selected_by":          "deterministic_override" if override else "token_scoring",
        }

    try:
        agent_context = []
        for a in agents:
            profile = AGENT_SKILL_PROFILES.get(a.get("agent_role_key", ""), {})
            score_info = next((s for s in python_scores if s["agent_id"] == a["id"]), {})
            agent_context.append({
                "id":           a["id"],
                "name":         a["full_name"],
                "role":         a.get("agent_role_key", "unknown"),
                "expertise":    profile.get("expertise_summary", "General support"),
                "skill_tokens": profile.get("skill_tokens", []),
                "current_load": a.get("current_load", 0),
                "token_score":  score_info.get("score", 0),
            })

        groq = get_groq_client()
        response = await groq.chat.completions.create(
            model=settings.GROQ_CLASSIFICATION_MODEL,
            messages=[
                {"role": "system", "content": AGENT_SELECTION_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps({
                        "ticket_skill_tokens": ticket_tokens,
                        "token_weights":       token_weights,
                        "available_agents":    agent_context,
                    }),
                },
            ],
            temperature=0.05,
            max_tokens=200,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        selected_id = result.get("selected_agent_id")

        valid_ids = {a["id"] for a in agents}
        if selected_id not in valid_ids:
            print(f"[GROQ Stage2] Invalid agent_id {selected_id!r}, using token fallback")
            selected_id = best_by_tokens["agent_id"]
            result["routing_rationale"] = best_by_tokens["rationale"]
            result["fallback_used"] = True

        result["selected_agent_id"] = selected_id
        result["selected_by"] = "groq_agent_selection"

        # Final sanity check — override if clearly wrong
        override = _deterministic_override(ticket_title, ticket_description, selected_id, agents)
        if override:
            result["selected_agent_id"] = override
            result["selected_by"] = "deterministic_override"
            result["routing_rationale"] += " [Override: keyword match corrected routing]"
        return result

    except Exception as e:
        print(f"[GROQ Stage2] Agent selection failed: {e}, using token fallback")
        fallback_id = best_by_tokens["agent_id"]
        override = _deterministic_override(ticket_title, ticket_description, fallback_id, agents)
        return {
            "selected_agent_id":    override or fallback_id,
            "routing_rationale":    best_by_tokens["rationale"],
            "selection_confidence": min(best_by_tokens["score"] / 30.0, 0.95),
            "token_match_score":    best_by_tokens["score"],
            "selected_by":          "deterministic_override" if override else "token_scoring_fallback",
        }


def _score_agents_by_tokens(
    ticket_tokens: list[str],
    token_weights: dict[str, int],
    agents: list[dict],
) -> list[dict]:
    results = []
    for agent in agents:
        role_key = agent.get("agent_role_key", "")
        profile  = AGENT_SKILL_PROFILES.get(role_key, {})
        agent_tokens = set(profile.get("skill_tokens", []))

        score = 0.0
        matched = []
        for token in ticket_tokens:
            if token in agent_tokens:
                weight = token_weights.get(token, 1)
                score += weight * (1 + math.log(weight + 1))
                matched.append(token)

        load  = agent.get("current_load", 0)
        score = max(0, score - (load * 0.5))

        profile_name = profile.get("display_name", role_key)
        rationale = (
            f"Routed to {profile_name} — matched: {', '.join(matched[:5]) or 'general expertise'}. "
            f"Score: {score:.1f}."
        )

        results.append({
            "agent_id":      agent["id"],
            "agent_name":    agent["full_name"],
            "role_key":      role_key,
            "score":         round(score, 2),
            "matched_tokens": matched,
            "rationale":     rationale,
        })

    return sorted(results, key=lambda x: x["score"], reverse=True)


# ─── Deterministic Routing Override ──────────────────────────────────────────
# This runs AFTER both GROQ stages as a final sanity check.
# It prevents the AI from misrouting tickets that have clear keyword signals.
# Rules here are hard — they override GROQ when the answer is unambiguous.

_IT_HARD_SIGNALS = [
    "pc", "computer", "laptop", "desktop", "monitor", "keyboard", "mouse",
    "printer", "scanner", "screen", "hard drive", "ssd", "ram", "cpu",
    "frozen", "froze", "freezing", "blue screen", "bsod", "won't start",
    "won't boot", "black screen", "password", "locked out", "vpn",
    "wifi", "wi-fi", "internet", "network", "ethernet", "outlook",
    "microsoft teams", "teams ", "sharepoint", "onedrive", "microsoft 365",
    "m365", "office 365", "software install", "can't install",
    "device", "phone", "mobile", "tablet", "headset", "webcam",
    "slow computer", "slow laptop", "slow pc", "computer crash",
    "laptop crash", "pc crash", "system crash",
    # Common office hardware that was previously missing — these are exactly
    # the kind of ticket that should never need an AI call to route correctly.
    "projector", "tv", "television", "hdmi", "vga", "av equipment",
    "audio visual", "conference room", "meeting room", "speaker",
    "microphone", "mic ", "router", "cable", "charger", "dock",
    "docking station", "adapter", "extension cord", "power strip",
]

_AI_TOOL_HARD_SIGNALS = [
    "ai chatbot", "ai tool", "ai assistant", "ai chat", "copilot",
    "chatgpt", "openai", "the ai ", " ai ", "our ai", "ai bot", "llm",
    "artificial intelligence",
]

_AUTOMATION_HARD_SIGNALS = [
    "workflow", "approval flow", "cron job", "scheduled job", "scheduled task",
    "power automate", "zapier", "make.com", "integration not", "not triggering",
    "leave workflow", "onboarding workflow", "offboarding workflow",
    "erp workflow", "provisioning workflow",
    # A recurring automated business process that silently failed is a
    # scheduled-job failure conceptually, even when nobody used the word
    # "workflow" or "scheduled job" — payroll is the clearest example:
    # an overnight batch run that didn't happen. Without these, a ticket
    # like "payroll wasn't processed overnight" reads as a Finance/reporting
    # request to a token-matcher (it shares vocabulary with ai_intern's
    # "financial_report" tokens) instead of the automation failure it is.
    "payroll not processed", "payroll wasn't processed", "payroll was not processed",
    "payroll failed", "payroll didn't run", "payroll did not run",
    "salaries not processed", "salaries were not paid", "salaries not paid",
    "overnight process", "overnight job", "overnight run", "overnight batch",
    "batch job", "batch process", "didn't run overnight", "did not run overnight",
    "failed to process overnight", "failed to run overnight",
    "automatically generate", "auto-generated report failed",
]

_DATA_HARD_SIGNALS = [
    "generate a report", "create a report", "data analysis", "analyse our",
    "analyze our", "create a dashboard", "build a dashboard",
    "summarise these", "summarize these", "trend analysis", "generate insights",
    "employee turnover report", "survey results",
]


def _deterministic_override(
    title: str,
    description: str,
    selected_agent_id: str,
    agents: list[dict],
) -> str | None:
    """
    Returns a corrected agent_id if the selection is clearly wrong,
    otherwise returns None (keep original selection).
    Uses exact keyword matching — no AI involved.
    """
    text = (title + " " + description).lower()

    def _find_agent_by_role(role_key: str) -> str | None:
        for a in agents:
            if a.get("agent_role_key") == role_key:
                return a["id"]
        return None

    # AI tool signals take priority — check first
    if any(sig in text for sig in _AI_TOOL_HARD_SIGNALS):
        correct = _find_agent_by_role("ai_intern")
        if correct and correct != selected_agent_id:
            print(f"[OVERRIDE] AI tool signal detected → forcing ai_intern")
            return correct
        return None  # already correct

    # Hard IT signals — these MUST go to IT Support
    if any(sig in text for sig in _IT_HARD_SIGNALS):
        correct = _find_agent_by_role("it_support_technician")
        if correct and correct != selected_agent_id:
            print(f"[OVERRIDE] IT hardware/device signal → forcing it_support_technician")
            return correct
        return None

    # Hard automation signals — must go to junior_operations
    if any(sig in text for sig in _AUTOMATION_HARD_SIGNALS):
        correct = _find_agent_by_role("junior_operations")
        if correct and correct != selected_agent_id:
            print(f"[OVERRIDE] Automation/workflow signal → forcing junior_operations")
            return correct
        return None

    # Hard data/reporting signals — must go to ai_intern
    if any(sig in text for sig in _DATA_HARD_SIGNALS):
        correct = _find_agent_by_role("ai_intern")
        if correct and correct != selected_agent_id:
            print(f"[OVERRIDE] Data/reporting signal → forcing ai_intern")
            return correct
        return None

    return None  # no override needed


# ─── AI Reply Generation ──────────────────────────────────────────────────────

AI_REPLY_PROMPT = """You are an enterprise support agent for TicketIQ.
You must write a specific, actionable reply based on the EXACT ticket content provided.

YOUR ROLE SCOPES:
- IT Support Assistant: passwords, VPN, hardware, software, email, printers, account access.
  → Give concrete numbered troubleshooting steps tailored to the specific problem described.
  → E.g. "My AI tool is not responding" → treat it as a software/app issue, give IT steps.

- AI Intern: data analysis, reports, dashboards, summaries, trend analysis, documentation.
  → Confirm exactly what you will produce, name the specific report/analysis requested.
  → Give an estimated delivery time.

- Junior Automation Support: broken workflows, failed scheduled jobs, integration failures.
  → Ask for the specific workflow name and when it last worked, OR confirm the fix steps.

STRICT RULES:
1. Read the ticket title and description carefully — your reply must reference the actual problem.
2. Never start with "Thank you for contacting" or "I hope this" — start with the action.
3. No filler. No generic sentences. Every sentence must be specific to this ticket.
4. Under 150 words.
5. Do not offer to do things outside your role scope."""


async def generate_ai_reply(
    title: str,
    description: str,
    department: str,
    category: str,
    agent_role: str = "it_support_technician",
) -> str:
    ROLE_LABEL = {
        "ai_intern":             "AI Intern (Data & Reporting Analyst / AI Tooling Owner)",
        "it_support_technician": "IT Support Assistant",
        "junior_operations":     "Junior Automation Support",
        "admin":                 "Support Manager",
    }.get(agent_role, "Support Agent")

    # Detect if this is an AI-tool issue vs a data/reporting request
    ai_tool_keywords = ["not responding", "not loading", "crashing", "can't access",
                        "won't open", "error", "broken", "down", "slow", "login",
                        "chatbot", "copilot", "ai tool", "ai assistant", "ai chat"]
    is_ai_tool_issue = agent_role == "ai_intern" and any(
        k in (title + " " + description).lower() for k in ai_tool_keywords
    )

    fallback_by_role = {
        "ai_intern": (
            f"I've picked up your ticket: \"{title}\". "
            + ("I can see the AI tool is having issues — let me look into this now. "
               "In the meantime, try clearing your browser cache and cookies, then refresh. "
               "If the issue persists, try an incognito window or a different browser. "
               "I'll check the service status and update you shortly."
               if is_ai_tool_issue else
               "I'll begin the analysis and have the report/summary ready for you shortly — "
               "I'll update this ticket once it's complete.")
        ),
        "it_support_technician": f"I've picked up your ticket regarding \"{title}\". Let me walk you through the steps to resolve this — please try the following and let me know the outcome.",
        "junior_operations":     f"I've logged your workflow issue: \"{title}\". Could you confirm the name of the workflow and when it last ran successfully? That will help me pinpoint the failure.",
    }.get(agent_role, f"Your ticket \"{title}\" has been received and I'm reviewing it now.")

    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        return fallback_by_role

    try:
        groq = get_groq_client()
        response = await groq.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": AI_REPLY_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"You are the {ROLE_LABEL}.\n"
                        f"Department: {department}\n"
                        f"Category: {category}\n"
                        f"Title: {title}\n\n"
                        f"Employee's description:\n{description}\n\n"
                        f"Write a specific, actionable reply as the {ROLE_LABEL}."
                    ),
                },
            ],
            temperature=0.4,
            max_tokens=220,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[GROQ] Reply generation failed: {e}")
        return fallback_by_role


# ─── Fallback Classifiers ─────────────────────────────────────────────────────

def _keyword_dept(text: str) -> str:
    text = text.lower()
    scores = {
        "it": sum(1 for k in ["password","vpn","laptop","computer","software","hardware",
            "network","wifi","email","access","printer","system","login","install",
            "crash","bug","error","server","internet","phone","monitor","account"] if k in text),
        "hr": sum(1 for k in ["leave","vacation","payslip","salary","contract","onboarding",
            "offboarding","policy","benefits","performance","review","hr","hiring",
            "resignation","training","annual leave","sick leave","maternity"] if k in text),
        "finance": sum(1 for k in ["expense","reimbursement","invoice","payroll","budget",
            "purchase","vendor","payment","financial","claim","receipt","tax",
            "accounting","refund","purchase order","approval"] if k in text),
        "operations": sum(1 for k in ["office","facilities","maintenance","supplies","travel",
            "logistics","building","desk","chair","parking","cleaning","repair",
            "equipment","delivery","access card","meeting room","stationery"] if k in text),
    }
    return max(scores, key=scores.get) if max(scores.values()) > 0 else "it"


def _extract_fallback_tokens(text: str) -> list[str]:
    """
    Keyword-based fallback that maps problem type → agent tokens.
    Determines which AGENT scope fits, not which department submitted.
    """
    text_lower = text.lower()

    # GOLDEN RULE: any mention of AI tooling → ai_intern, regardless of context.
    # This must be checked FIRST, before IT/automation/generic-broken checks.
    ai_signals = ["ai chatbot","ai tool","ai assistant","ai chat","copilot",
                  "chatgpt","openai","gpt","llm","ai bot","artificial intelligence"]
    if any(k in text_lower for k in ai_signals):
        return ["ai_tool", "ai_chatbot", "ai_assistant"]

    # IT Support signals
    it_signals = ["password","reset","locked","vpn","wifi","network","laptop","printer",
                  "email","outlook","teams","install","software","hardware","crash","login",
                  "access","permission","account","computer","monitor","device"]
    # AI/Data signals
    data_signals = ["report","analysis","dashboard","trend","insight","summarize","summary",
                    "research","data","analytics","document","faq","knowledge","turnover",
                    "statistics","chart","graph","forecast","survey"]
    # Automation signals — must be SPECIFIC workflow/job terms, not generic "not working"
    automation_signals = ["workflow","workflow failure","scheduled job","scheduled task",
                          "cron job","job failed","not triggering","power automate",
                          "zapier","make.com","approval flow","leave workflow",
                          "onboarding workflow","offboarding workflow","erp workflow",
                          "integration failure","api integration","provisioning failure"]

    it_score   = sum(1 for k in it_signals if k in text_lower)
    data_score = sum(1 for k in data_signals if k in text_lower)
    auto_score = sum(1 for k in automation_signals if k in text_lower)

    # Generic "not responding / not working / crashed" without workflow context → IT
    generic_broken = any(k in text_lower for k in [
        "not responding", "not working", "not loading", "crashed", "can't open",
        "keeps freezing", "slow", "broken", "won't open"
    ])
    if generic_broken and auto_score == 0:
        return ["software", "system", "crash"]

    if auto_score > 0 and auto_score >= data_score and auto_score >= it_score:
        return ["workflow_failure", "automation", "integration"]
    elif data_score >= it_score:
        return ["report", "data_analysis", "analytics"]
    else:
        return ["password", "access", "system"]


_PRIORITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}

# General time-pressure language — "I need this badly/soon" — bumps to at
# least HIGH. This is about urgency the employee is expressing, not
# necessarily severity of impact, so it doesn't jump all the way to critical.
_URGENCY_HIGH_SIGNALS = [
    "urgently", "urgent", "asap", "as soon as possible", "need help fast",
    "need this fast", "need this now", "need it now", "need this asap",
    "i need to submit now", "need to submit urgently", "right away",
    "right now", "immediately", "time sensitive", "time-sensitive",
    "running out of time", "deadline today", "deadline is today",
    "deadline is in", "due today", "due in", "can't wait", "cannot wait",
    "won't wait", "please hurry", "hurry", "quickly please", "fast as possible",
]

# Severity-of-impact language — work is actually blocked, or something is
# actively broken/at risk — bumps all the way to CRITICAL.
_URGENCY_CRITICAL_SIGNALS = [
    "emergency", "system is down", "systems down", "production down",
    "production is down", "site is down", "completely down", "totally down",
    "data loss", "losing data", "lost data", "security breach", "data breach",
    "been hacked", "ransomware", "completely blocked", "totally blocked",
    "cannot work at all", "can't work at all", "dead in the water",
    "everyone is affected", "entire team is blocked", "whole team is blocked",
    "business critical", "mission critical",
    # The classification prompt's own priority rules (below) already name
    # "payroll not processed" as a CRITICAL trigger — this override makes
    # sure that's actually enforced rather than just stated, the same way
    # the IT-routing override backs up STEP 2 instead of trusting the model
    # to apply every rule perfectly every time.
    "payroll not processed", "payroll wasn't processed", "payroll was not processed",
    "payroll failed", "payroll didn't run", "payroll did not run",
    "salaries not processed", "salaries not paid", "salaries were not paid",
    "employees have not received their salaries", "didn't get paid", "did not get paid",
]


def _apply_urgency_override(title: str, description: str, result: dict) -> None:
    """
    Mutates result["priority"] in place — bumps it up (never down) when the
    employee's own wording signals urgency the classifier may have missed,
    e.g. "I need this fixed urgently" or "I need to submit this now".

    Deliberately a plain substring check, same philosophy as the agent
    routing override: cheap, deterministic, and works even if the AI call
    failed entirely and we're on the keyword fallback.
    """
    text = (title + " " + description).lower()
    current = result.get("priority", "medium")
    current_rank = _PRIORITY_ORDER.get(current, 1)

    target = None
    if any(sig in text for sig in _URGENCY_CRITICAL_SIGNALS):
        target = "critical"
    elif any(sig in text for sig in _URGENCY_HIGH_SIGNALS):
        target = "high"

    if target and _PRIORITY_ORDER[target] > current_rank:
        result["priority"] = target
        result["priority_reason"] = (
            f"{result.get('priority_reason', '')} "
            f"[Bumped to {target} — employee's wording signals urgency]"
        ).strip()
        result["urgency_override"] = True


# Used only when Groq is unavailable — a plain AI judgment call on relevance
# isn't possible, so this stays deliberately narrow (fail-open) to avoid
# ever blocking a real ticket just because it's fallback mode. Only flags
# the most obvious case: a trivia-style question with zero work-related
# vocabulary anywhere in it.
_WORK_SIGNAL_WORDS = [
    "ticket", "system", "account", "pay", "salary", "payroll", "leave",
    "benefit", "policy", "invoice", "budget", "expense", "vendor", "client",
    "project", "deadline", "manager", "team", "office", "work", "company",
    "employee", "hr ", "it ", "request", "issue", "problem", "broken",
    "error", "access", "password", "report", "approve", "process", "login",
    "vpn", "email", "software", "hardware", "device", "printer", "laptop",
    "computer", "server", "network", "wifi", "onboarding", "training",
    "reimburse", "timesheet", "schedule", "shift", "contract", "document",
]
_TRIVIA_OPENERS = [
    "what is", "what's", "who is", "who was", "who won", "who invented",
    "who created", "when did", "where is", "how many", "why does", "why is",
    "what year", "what color", "what colour",
]


def _looks_like_non_work_trivia(text: str) -> bool:
    lower = text.lower().strip()
    if not any(lower.startswith(o) for o in _TRIVIA_OPENERS):
        return False
    if any(w in lower for w in _WORK_SIGNAL_WORDS):
        return False
    return len(lower.split()) <= 25  # short, simple question — not a real ticket description


def _fallback_classify(title: str, description: str) -> dict:
    text = title + " " + description
    dept_slug = _keyword_dept(text)
    dept_name = {
        "hr": "Human Resources", "it": "Information Technology",
        "finance": "Finance", "operations": "Operations",
    }[dept_slug]
    tokens = _extract_fallback_tokens(text)
    is_trivia = _looks_like_non_work_trivia(text)

    return {
        "is_support_request": not is_trivia,
        "rejection_reason":   "This doesn't look like a work-related support request." if is_trivia else "",
        "department_slug":  dept_slug,
        "department_name":  dept_name,
        "priority":         "medium",
        "category":         "General Support",
        "sentiment":        "neutral",
        "summary":          f"Support request: {title}",
        "priority_reason":  "Default medium priority (fallback classifier)",
        "skill_tokens":     tokens,
        "token_weights":    {t: 2 for t in tokens},
        "classified_by":    "fallback_keyword",
    }
