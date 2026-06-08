"""
TicketIQ — AI Tokenization & Universal Agent Routing
=====================================================
All agents are available for ALL departments.
The AI tokenizes the ticket content and scores it against each agent's
skill profile. The agent with the highest token overlap — weighted by
problem severity and expertise depth — gets the ticket.

TWO-STAGE PROCESS:
  Stage 1 — Ticket Classification
    GROQ reads the ticket and returns:
      - department, priority, category, sentiment, summary
      - a ranked list of skill_tokens extracted from the ticket content

  Stage 2 — Agent Selection (tokenized scoring)
    The extracted tokens are scored against every active agent's skill_tokens.
    The agent with the highest weighted score is assigned.
    GROQ is used to validate/confirm the selection when available.
    A pure Python fallback handles GROQ outages with zero service disruption.
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


# ─── Stage 1: Ticket Classification Prompt ────────────────────────────────────
# The AI extracts meaning and skill tokens from the ticket.
# It does NOT know which agent will be selected — that's Stage 2.

CLASSIFICATION_PROMPT = """You are TicketIQ's ticket analysis engine.

Read the support ticket and extract structured information including skill tokens
that describe what expertise is needed to resolve it.

DEPARTMENTS: hr | it | finance | operations

SKILL TOKEN VOCABULARY (extract the most relevant ones):
HR tokens: leave, annual_leave, sick_leave, maternity, paternity, vacation,
  payslip, salary, pay, compensation, bonus, onboarding, offboarding, new_hire,
  resignation, termination, hr_policy, policy, contract, employment, benefits,
  pension, performance_review, appraisal, training, learning, development,
  workplace_conduct, harassment, conflict, disciplinary, job_change, promotion,
  transfer, probation, health_insurance, medical_aid, wellbeing

IT tokens: password, vpn, network, wifi, internet, connectivity, laptop, computer,
  pc, desktop, hardware, device, software, installation, install, update, upgrade,
  crash, bug, error, system, server, infrastructure, cloud, email, outlook, teams,
  slack, access, permission, account, login, authentication, 2fa, mfa, security,
  printer, scanner, monitor, keyboard, mouse, phone, mobile, backup, data_recovery,
  cybersecurity, breach, database, api, integration, deployment

Finance tokens: expense, expense_claim, reimbursement, invoice, receipt, payroll,
  salary_discrepancy, budget, purchase_order, vendor_payment, financial_report,
  accounting_software, tax, vat, audit, financial_system, erp, sap,
  approval_workflow, cost_centre, procurement_system

Operations tokens: office, facilities, maintenance, repair, building, desk, chair,
  furniture, ergonomics, meeting_room, conference_room, booking, cleaning,
  housekeeping, sanitization, parking, access_card, security_badge, key_fob,
  air_conditioning, heating, lighting, plumbing, elevator, supplies, stationery,
  office_supplies, consumables, delivery, courier, shipment, inventory, travel,
  flight, hotel, accommodation, car_hire, event, event_logistics, catering, venue,
  vendor, supplier, procurement, purchase_request, company_vehicle, fleet,
  asset_management, health_safety, fire_safety, first_aid, incident

PRIORITY DETECTION — read the content carefully, don't default to medium:

CRITICAL (assign immediately — 4hr SLA):
  Keywords/signals: "not working at all", "completely blocked", "server down", "system down",
  "data loss", "data breach", "security incident", "hacked", "ransomware", "virus",
  "payroll not processed", "salaries not paid", "production down", "outage",
  "medical emergency", "safety hazard", "fire", "flooding", "injury",
  "urgent urgent", "emergency", "ASAP", "immediately", "right now",
  "cannot work at all", "whole team affected", "entire company", "everyone impacted"

HIGH (respond within 24hrs):
  Keywords/signals: "blocking my work", "cannot complete", "deadline today", "due tomorrow",
  "client presentation", "meeting in an hour", "manager waiting", "customer affected",
  "expense not reimbursed for weeks", "payslip wrong", "overpaid", "underpaid",
  "VPN down" (if working remotely), "email not working", "can't access system",
  "multiple people affected", "team blocked", "frustrated", "escalating"

MEDIUM (respond within 3 days):
  Standard requests with normal business impact. Single person affected.
  Can work around the issue temporarily. No immediate deadline pressure.

LOW (respond within a week):
  Non-urgent. Nice-to-have. Easy workaround exists. Future planning.
  Examples: leave requests for distant dates, general policy questions, minor improvements

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "department_slug": "<hr|it|finance|operations>",
  "department_name": "<full department name>",
  "priority": "<critical|high|medium|low>",
  "category": "<specific sub-category, e.g. 'VPN Access', 'Leave Request', 'Expense Claim'>",
  "sentiment": "<positive|neutral|frustrated|urgent>",
  "summary": "<one sentence: what does the employee need?>",
  "priority_reason": "<one sentence: why this priority?>",
  "skill_tokens": ["<token1>", "<token2>", ...],
  "token_weights": {"<token>": <1-3>, ...}
}

token_weights: rate each token 1 (loosely relevant) to 3 (core skill required).
Extract 3–12 tokens. Be precise — only tokens that truly describe the expertise needed."""


# ─── Stage 2: Agent Selection Prompt ─────────────────────────────────────────
# Given ticket tokens and agent profiles, AI confirms the best agent.

AGENT_SELECTION_PROMPT = """You are TicketIQ's agent assignment engine.

A ticket has been tokenized. You have the extracted skill tokens and a list of
available agents with their skill profiles. Select the single best agent.

SELECTION RULES:
1. Match ticket skill_tokens against each agent's skill_tokens
2. Weight by token_weights — higher weight tokens matter more
3. Consider agent current_load — prefer agents with fewer active tickets
4. Pick the agent whose skills BEST match the PRIMARY problem in the ticket
5. Any agent can handle any ticket — pick by skill fit, not by department rule

Respond ONLY with valid JSON:
{
  "selected_agent_id": "<agent_id>",
  "selection_confidence": <0.0-1.0>,
  "routing_rationale": "<one sentence: why this specific agent for this ticket>",
  "token_match_score": <0-100>
}"""


async def classify_ticket(title: str, description: str) -> dict:
    """
    Stage 1: Extract skill tokens and classification from ticket content.
    Returns classification dict including skill_tokens and token_weights.
    """
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

        # Validate and sanitise
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
    agents: list[dict],  # [{"id": "...", "full_name": "...", "agent_role_key": "...", "current_load": N}]
) -> dict:
    """
    Stage 2: Given tokenized ticket and all available agents,
    return the best agent ID using AI tokenization scoring.
    Falls back to pure Python token scoring if GROQ is unavailable.
    """
    if not agents:
        return {"selected_agent_id": None, "routing_rationale": "No agents available", "selection_confidence": 0}

    # Always compute Python token scores (used as fallback and as sanity check)
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
        # Build agent context for GROQ
        agent_context = []
        for a in agents:
            profile = AGENT_SKILL_PROFILES.get(a.get("agent_role_key", ""), {})
            score_info = next((s for s in python_scores if s["agent_id"] == a["id"]), {})
            agent_context.append({
                "id":               a["id"],
                "name":             a["full_name"],
                "role":             a.get("agent_role_key", "unknown"),
                "expertise":        profile.get("expertise_summary", "General support"),
                "skill_tokens":     profile.get("skill_tokens", []),
                "current_load":     a.get("current_load", 0),
                "token_score":      score_info.get("score", 0),
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

        # Validate — must be a real agent ID
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
    """
    Pure Python token overlap scoring.
    Score = sum of weight * (1 + log(overlap_depth)) for each matching token.
    Load penalty: subtract 0.5 per active ticket on the agent.
    """
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

        # Load balancing penalty
        load = agent.get("current_load", 0)
        score = max(0, score - (load * 0.5))

        profile_name = profile.get("display_name", role_key)
        rationale = (
            f"Assigned to {profile_name} — matched skill tokens: {', '.join(matched[:5]) or 'general expertise'}. "
            f"Token score: {score:.1f}."
        )

        results.append({
            "agent_id": agent["id"],
            "agent_name": agent["full_name"],
            "role_key": role_key,
            "score": round(score, 2),
            "matched_tokens": matched,
            "rationale": rationale,
        })

    return sorted(results, key=lambda x: x["score"], reverse=True)


# ─── AI Reply Generation ──────────────────────────────────────────────────────

AI_REPLY_PROMPT = """You are a helpful enterprise support agent for TicketIQ.
Write a professional, empathetic, and actionable reply to this support ticket.
Keep it under 150 words. Start directly with the help — no "I hope this email finds you well."
Use the agent's expertise area to give a specific, useful response."""


async def generate_ai_reply(title: str, description: str, department: str, category: str) -> str:
    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        return (
            f"Thank you for submitting your {department} ticket regarding '{title}'. "
            "Our team has received your request and will respond shortly. "
            "Please include any additional details that may help us resolve this faster."
        )
    try:
        groq = get_groq_client()
        response = await groq.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": AI_REPLY_PROMPT},
                {"role": "user",   "content": f"Department: {department}\nCategory: {category}\nTitle: {title}\n\nDescription: {description}"},
            ],
            temperature=0.6,
            max_tokens=200,
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"[GROQ] Reply generation failed: {e}")
        return f"Thank you for contacting {department} support. We have received your ticket and will respond shortly."


# ─── Fallback Classifiers ─────────────────────────────────────────────────────

def _keyword_dept(text: str) -> str:
    text = text.lower()
    scores = {
        "it": sum(1 for k in ["password","vpn","laptop","computer","software","hardware",
            "network","wifi","email","access","printer","system","login","install",
            "crash","bug","error","server","internet","phone","monitor","account"] if k in text),
        "hr": sum(1 for k in ["leave","vacation","payslip","salary","contract","onboarding",
            "offboarding","policy","benefits","performance","review","hr","employee",
            "hiring","resignation","training","annual leave","sick leave","maternity"] if k in text),
        "finance": sum(1 for k in ["expense","reimbursement","invoice","payroll","budget",
            "purchase","vendor","payment","financial","claim","receipt","tax",
            "accounting","refund","purchase order","approval"] if k in text),
        "operations": sum(1 for k in ["office","facilities","maintenance","supplies","travel",
            "logistics","building","desk","chair","parking","cleaning","repair",
            "equipment","delivery","access card","meeting room","stationery"] if k in text),
    }
    return max(scores, key=scores.get) if max(scores.values()) > 0 else "it"


def _extract_fallback_tokens(text: str) -> list[str]:
    """Extract tokens from text using the full vocabulary."""
    text = text.lower().replace(" ", "_")
    all_tokens = []
    for profile in AGENT_SKILL_PROFILES.values():
        all_tokens.extend(profile["skill_tokens"])
    return [t for t in set(all_tokens) if t.replace("_", " ") in text or t in text][:10]


def _fallback_classify(title: str, description: str) -> dict:
    text = title + " " + description
    dept_slug = _keyword_dept(text)
    dept_name = {
        "hr": "Human Resources", "it": "Information Technology",
        "finance": "Finance", "operations": "Operations",
    }[dept_slug]
    tokens = _extract_fallback_tokens(text)
    if not tokens:
        # Default tokens by department
        tokens = {
            "hr": ["hr_policy", "employee"],
            "it": ["software", "system"],
            "finance": ["expense", "budget"],
            "operations": ["office", "facilities"],
        }[dept_slug]

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
