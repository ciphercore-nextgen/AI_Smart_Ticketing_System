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
   Skill tokens: password, password_reset, account_lockout, login, authentication,
   2fa, mfa, account, access, permission, email, outlook, microsoft_365, teams,
   vpn, network, wifi, internet, connectivity, laptop, computer, hardware, device,
   printer, software, installation, install, update, crash, bug, error, system,
   shared_drive, new_employee_setup, device_onboarding, cybersecurity, backup

2. ai_intern
   Handles: data analysis, report generation, dashboard assistance, research,
   knowledge base creation, document summarization, trend analysis, FAQ generation,
   business intelligence, data cleaning, AI-powered insights.
   Also handles requests where an employee needs AI ASSISTANCE for analysis,
   research, or reporting — e.g. "help me use AI to analyse our data",
   "I need an AI-generated summary", "can AI help me research this topic".
   Skill tokens: report, reporting, data_analysis, analysis, analytics, dashboard,
   trend_analysis, trends, insights, business_intelligence, data_cleaning,
   document_summary, summarize, faq, knowledge_base, research, documentation,
   employee_turnover, monthly_report, quarterly_report, survey_analysis,
   support_trends, ticket_analytics, performance_report, financial_report,
   operational_report, hr_report, ai_insights, ai_assistance, ai_powered_analysis,
   ai_powered_report, ai_recommendation, ai_summary, content_generation,
   text_analysis, sentiment_analysis, data_extraction, intelligent_search

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

AI-RELATED TICKETS — read carefully:
- "Help me use AI to analyse data / generate a report / summarise a document / research a topic"
  → ai_intern (they provide AI-powered data and reporting assistance)
- "I need AI insights / AI-powered dashboard / AI recommendations on our data"
  → ai_intern
- "The AI chatbot/tool is not loading, not responding, crashing, won't open, can't access it"
  → it_support_technician (broken software — user can't even get in, IT must fix the access)
- "Copilot not working", "ChatGPT access blocked", "AI assistant giving errors"
  → it_support_technician (IT access/software issue, not a data task)
- "The AI automation / AI workflow is failing / not triggering"
  → junior_operations (broken automated process)

KEY TEST: Is the user asking someone to DO AI work for them (analysis, reports)?
→ ai_intern. Is the user saying an AI tool/app is technically broken and they can't use it?
→ it_support_technician.

WORKFLOW/AUTOMATION TICKETS:
- "automation" routes to junior_operations ONLY when a named BUSINESS WORKFLOW or
  SCHEDULED JOB is broken (e.g. "leave approval flow stopped", "cron job failed").
- Generic "something isn't working" or "it's not responding" without naming a workflow
  → it_support_technician.

BROKEN APP/SOFTWARE TICKETS:
- "not responding", "not loading", "crashed", "can't open", "keeps freezing"
  → it_support_technician UNLESS a specific named workflow or scheduled job is mentioned.

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

IT Support Assistant: ONLY handles IT problems — passwords, devices, access,
  hardware, software, email, VPN, printers, network. NOT data analysis, NOT HR.

AI Intern: ONLY handles data/reporting/analysis work — reports, dashboards,
  research, documentation, summaries, FAQs, trend analysis. NOT IT support, NOT HR policy.

Junior Automation Support: ONLY handles workflow and automation failures —
  broken workflows, failed scheduled jobs, integration errors, automation bugs.
  NOT passwords, NOT data analysis, NOT hardware, NOT broken apps or software.

ROUTING EXAMPLES — use these to calibrate:
- "Password reset / can't login / VPN down / laptop broken" → IT Support Assistant
- "Generate a report / analyse data / summarise document / create dashboard" → AI Intern
- "I need help using AI to research our sales trends" → AI Intern (AI-powered analysis task)
- "Copilot is not loading / AI chatbot app is broken / can't access the AI tool" → IT Support Assistant (broken app access)
- "The leave approval workflow stopped / scheduled job failed / automation not triggering" → Junior Automation Support
- "HR submitted a ticket about a password reset" → IT Support Assistant (content, not dept)
- "Finance submitted a ticket about a trend report" → AI Intern (content, not dept)
- "IT submitted a ticket about a workflow failure" → Junior Automation Support (content, not dept)

DISAMBIGUATION FOR AI-RELATED TICKETS:
Ask: is the user asking someone to DO AI work for them (analysis, reports, summaries)?
→ ai_intern.
Or is the user saying an AI tool/app is technically broken and they can't use it at all?
→ it_support_technician.

STRICT RULE: "not responding / not working / crashed / not loading" without a named
workflow or scheduled job → IT Support Assistant, NOT Junior Automation Support.

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
        "ai_intern":             "AI Intern (Data & Reporting Analyst)",
        "it_support_technician": "IT Support Assistant",
        "junior_operations":     "Junior Automation Support",
        "admin":                 "Support Manager",
    }.get(agent_role, "Support Agent")

    fallback_by_role = {
        "ai_intern":             f"I've received your request for \"{title}\". I'll begin the analysis and have the report/summary ready for you shortly — I'll update this ticket once it's complete.",
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
