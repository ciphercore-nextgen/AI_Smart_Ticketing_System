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

THE "AI" KEYWORD TEST — apply this FIRST, before any other rule:
If the ticket mentions AI, an AI tool, AI chatbot, Copilot, ChatGPT, AI assistant,
or any AI-branded product — in ANY context (using it, it's broken, it's slow,
access issues, errors, anything) — it goes to ai_intern. No exceptions, no
further disambiguation needed. The AI Intern owns the full lifecycle of AI
tooling at this company: usage help AND technical issues with that tooling.
  - "Help me use AI to research this" → ai_intern
  - "The AI chatbot is not responding" → ai_intern
  - "Copilot keeps crashing" → ai_intern
  - "Can't log into the AI tool" → ai_intern
  - "AI assistant is giving wrong answers" → ai_intern
Only if NOTHING in the ticket references AI/chatbot/Copilot/etc. do the
following rules apply.

WORKFLOW/AUTOMATION TICKETS (non-AI):
- "automation" routes to junior_operations ONLY when a named BUSINESS WORKFLOW or
  SCHEDULED JOB is broken (e.g. "leave approval flow stopped", "cron job failed").
- Generic "something isn't working" or "it's not responding" without naming a workflow
  → it_support_technician.

BROKEN APP/SOFTWARE TICKETS (non-AI):
- "not responding", "not loading", "crashed", "can't open", "keeps freezing"
  → it_support_technician UNLESS a specific named workflow/scheduled job is mentioned,
  OR the app is an AI tool (see AI KEYWORD TEST above, which takes priority).

PRIORITY RULES:
CRITICAL (4hr SLA): system/server down, data breach, security incident, payroll not processed,
  entire team blocked, production outage, safety hazard, emergency
HIGH (24hr SLA): blocking one person's work, deadline today, client presentation,
  email/VPN down for remote worker, wrong payslip, multiple people affected
MEDIUM (3 days): standard single-person request, can work around it temporarily
LOW (1 week): non-urgent, nice-to-have, future planning, distant leave request

Respond ONLY with valid JSON — no markdown, no explanation:
{
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

THE GOLDEN RULE — apply BEFORE anything else:
Does the ticket mention AI, an AI tool, AI chatbot, AI assistant, Copilot,
ChatGPT, or any AI-branded product, in ANY context? → AI Intern. Full stop.
This applies whether the employee wants help USING it or is reporting it's
BROKEN/SLOW/ERRORING/DOWN. Real companies route all tickets about a specific
tool to the team that owns that tool — the AI Intern owns AI tooling here.

ROUTING EXAMPLES — use these to calibrate:
- "Password reset / can't login / VPN down / laptop broken" → IT Support Assistant
- "Generate a report / analyse data / summarise document / create dashboard" → AI Intern
- "I need help using AI to research our sales trends" → AI Intern
- "The AI chatbot is not responding / Copilot keeps crashing / can't access the AI tool" → AI Intern (AI tooling — owned end-to-end by AI Intern)
- "The leave approval workflow stopped / scheduled job failed / automation not triggering" → Junior Automation Support
- "The AI-powered automation isn't triggering" → AI Intern (AI keyword wins — they'll loop in automation support internally if needed)
- "HR submitted a ticket about a password reset" → IT Support Assistant (content, not dept)
- "Finance submitted a ticket about a trend report" → AI Intern (content, not dept)
- "IT submitted a ticket about a workflow failure" → Junior Automation Support (content, not dept)
- "IT submitted a ticket saying the AI chatbot is down" → AI Intern (content mentions AI — overrides submitting dept AND the "sounds like IT" instinct)

STRICT RULE: "not responding / not working / crashed / not loading" WITHOUT any
mention of AI/chatbot/Copilot and WITHOUT a named workflow → IT Support Assistant.
If AI/chatbot/Copilot IS mentioned, it always goes to AI Intern regardless of
the "not responding" phrasing.

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
        return _fallback_classify(title, description)

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

        if not isinstance(result.get("skill_tokens"), list):
            result["skill_tokens"] = _extract_fallback_tokens(title + " " + description)

        if not isinstance(result.get("token_weights"), dict):
            result["token_weights"] = {t: 2 for t in result["skill_tokens"]}

        result["classified_by"] = "groq_tokenized"
        return result

    except Exception as e:
        print(f"[GROQ Stage1] Classification failed: {e}")
        return _fallback_classify(title, description)


async def select_agent_for_ticket(
    ticket_tokens: list[str],
    token_weights: dict[str, int],
    agents: list[dict],
) -> dict:
    if not agents:
        return {"selected_agent_id": None, "routing_rationale": "No agents available", "selection_confidence": 0}

    python_scores = _score_agents_by_tokens(ticket_tokens, token_weights, agents)
    best_by_tokens = max(python_scores, key=lambda x: x["score"])

    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        return {
            "selected_agent_id":    best_by_tokens["agent_id"],
            "routing_rationale":    best_by_tokens["rationale"],
            "selection_confidence": min(best_by_tokens["score"] / 30.0, 0.95),
            "token_match_score":    best_by_tokens["score"],
            "selected_by":          "token_scoring",
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
        return result

    except Exception as e:
        print(f"[GROQ Stage2] Agent selection failed: {e}, using token fallback")
        return {
            "selected_agent_id":    best_by_tokens["agent_id"],
            "routing_rationale":    best_by_tokens["rationale"],
            "selection_confidence": min(best_by_tokens["score"] / 30.0, 0.95),
            "token_match_score":    best_by_tokens["score"],
            "selected_by":          "token_scoring_fallback",
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


def _fallback_classify(title: str, description: str) -> dict:
    text = title + " " + description
    dept_slug = _keyword_dept(text)
    dept_name = {
        "hr": "Human Resources", "it": "Information Technology",
        "finance": "Finance", "operations": "Operations",
    }[dept_slug]
    tokens = _extract_fallback_tokens(text)

    return {
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
