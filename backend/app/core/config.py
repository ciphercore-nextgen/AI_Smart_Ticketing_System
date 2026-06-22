from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List

# Anchor to the backend folder itself, NOT the process's current working
# directory. Without this, starting the server from anywhere other than
# `backend/` silently fails to find .env and falls back to defaults —
# which is exactly how this project ended up with two divergent SQLite
# databases (one seeded via Docker, one freshly re-seeded by a bare/local
# run that couldn't find .env and didn't know it).
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./app/data/ticketiq.db"
    SECRET_KEY: str = "change-me-in-production-this-must-be-at-least-32-chars!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama3-8b-8192"
    GROQ_CLASSIFICATION_MODEL: str = "llama3-8b-8192"
    APP_ENV: str = "development"
    CORS_ORIGINS: str = "http://localhost:3000"

    class Config:
        env_file = str(_BACKEND_DIR / ".env")
        extra = "ignore"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


settings = Settings()

# ─────────────────────────────────────────────────────────────────────────────
# AGENT SKILL PROFILES
# ─────────────────────────────────────────────────────────────────────────────
# These are the skill tokens the AI uses when tokenizing a ticket.
# Every agent is available for every department — the AI reads the ticket,
# tokenizes it against each agent's skills, and picks the best match by ID.
#
# You can add more agents in the DB; give them an agent_skill_tokens list
# and they will automatically be considered for routing.
# ─────────────────────────────────────────────────────────────────────────────

AGENT_SKILL_PROFILES = {

    # ── IT Support Assistant ───────────────────────────────────────────────────
    # Entry-level IT support: devices, accounts, access, connectivity.
    # Does NOT handle HR decisions, payroll, financial analysis, or automation.
    "it_support_technician": {
        "display_name": "IT Support Assistant",
        "color": "#3B82F6",
        # NOTE: Does NOT own AI tooling (chatbots, Copilot, AI assistants) —
        # that is the AI Intern's domain end-to-end, including when broken.
        "skill_tokens": [
            "password", "password_reset", "account_lockout", "login", "authentication",
            "2fa", "mfa", "account", "access", "permission", "user_account",
            "email", "outlook", "microsoft_365", "teams", "sharepoint",
            "vpn", "network", "wifi", "internet", "connectivity", "remote_access",
            "laptop", "computer", "pc", "desktop", "hardware", "device",
            "printer", "scanner", "monitor", "keyboard", "mouse", "phone", "mobile",
            "software", "installation", "install", "update", "upgrade",
            "crash", "bug", "error", "system", "troubleshoot",
            "shared_drive", "file_access", "onedrive", "storage",
            "new_employee_setup", "device_onboarding", "it_access",
            "cybersecurity", "security_incident", "breach",
            "backup", "data_recovery", "server", "infrastructure",
        ],
        "expertise_summary": (
            "Entry-level IT support specialist. Handles password resets, account lockouts, "
            "email access, printer problems, VPN connectivity, software installation, "
            "laptop and desktop troubleshooting, Wi-Fi issues, user permissions, "
            "Microsoft 365 support, basic hardware issues, and new employee device setup. "
            "Does NOT handle AI tools, AI chatbots, or Copilot/ChatGPT-type issues — "
            "those are owned by the AI Intern, even when reported as 'not responding'."
        ),
    },

    # ── AI Intern ──────────────────────────────────────────────────────────────
    # Data, reporting, and business intelligence intern.
    # Does NOT handle passwords, hardware, payroll approvals, or HR policy decisions.
    "ai_intern": {
        "display_name": "AI Intern",
        "color": "#8B5CF6",
        "skill_tokens": [
            # Core data & reporting
            "report", "reporting", "data_analysis", "analysis", "analytics",
            "dashboard", "dashboard_assistance", "visualisation", "visualization",
            "trend_analysis", "trends", "insights", "business_intelligence",
            "data_cleaning", "data_quality", "dataset",
            "document_summary", "summarize", "summarization", "meeting_notes",
            "faq", "faq_generation", "knowledge_base", "documentation",
            "research", "research_task", "investigation",
            "employee_turnover", "turnover_report", "survey_analysis",
            "monthly_report", "quarterly_report", "annual_report",
            "support_trends", "ticket_analytics", "performance_report",
            "financial_report", "operational_report", "hr_report",
            "ai_insights", "predictive", "forecast",
            # AI-assisted work requests (user wants the intern TO DO AI work for them)
            "ai_assistance", "ai_chatbot_help", "ai_tool_request",
            "ai_powered_analysis", "ai_powered_report", "ai_powered_research",
            "copilot_assistance", "ai_recommendation", "ai_summary",
            "generate_content", "content_generation", "text_analysis",
            "sentiment_analysis", "data_extraction", "pattern_recognition",
            "intelligent_search", "smart_search", "ai_query",
            # AI tooling issues — AI Intern owns the tool end-to-end, including outages
            "ai_tool", "ai_chatbot", "ai_assistant", "ai_tool_error", "ai_tool_down",
            "ai_tool_not_responding", "copilot", "chatbot_error", "ai_outage",
            "ai_tool_crash", "ai_tool_slow",
        ],
        "expertise_summary": (
            "AI and data intern. Handles data analysis, report generation, dashboard assistance, "
            "research tasks, knowledge base creation, document summarization, trend analysis, "
            "data cleaning, AI-powered insights, FAQ generation, and business intelligence. "
            "Also owns the company's AI tooling (AI chatbot, Copilot-type assistants) "
            "end-to-end — helping employees USE these tools AND triaging/fixing issues "
            "when they're down, slow, erroring, or inaccessible. Does NOT fix non-AI "
            "software/hardware, reset passwords for non-AI systems, or handle HR policy."
        ),
    },

    # ── Junior Automation Support ──────────────────────────────────────────────
    # Workflow and process automation specialist.
    # Does NOT handle passwords, hardware, payroll decisions, or data analysis.
    "junior_operations": {
        "display_name": "Junior Automation Support",
        "color": "#F59E0B",
        "skill_tokens": [
            "workflow", "workflow_failure", "automation", "automation_failure",
            "process_automation", "automated_process", "business_process",
            "scheduled_job", "scheduled_task", "cron_job", "job_failure",
            "integration", "integration_failure", "api_integration",
            "notification_failure", "alert_failure", "email_notification",
            "approval_workflow", "approval_automation", "approval_not_triggering",
            "onboarding_workflow", "offboarding_workflow",
            "leave_workflow", "leave_approval_workflow",
            "finance_workflow", "finance_approval",
            "ticket_workflow", "escalation_automation",
            "low_code", "no_code", "power_automate", "zapier", "make",
            "erp_workflow", "system_integration", "provisioning_failure",
        ],
        "expertise_summary": (
            "Junior automation and workflow support specialist. Handles workflow failures, "
            "process automation issues, scheduled job failures, integration troubleshooting, "
            "approval workflow problems, notification failures, and low-code/no-code platform issues. "
            "Does NOT handle passwords, hardware, payroll, or data analysis."
        ),
    },
}


# Departments — employees submit tickets, they do NOT resolve them
DEPARTMENTS = [
    {"name": "Human Resources",        "slug": "hr",         "color": "#8B5CF6",
     "description": "Employee relations, benefits, policies, leave — submits tickets only"},
    {"name": "Information Technology", "slug": "it",         "color": "#3B82F6",
     "description": "Hardware, software, network, system access — submits tickets only"},
    {"name": "Finance",                "slug": "finance",    "color": "#10B981",
     "description": "Expenses, payroll, invoices, budget — submits tickets only"},
    {"name": "Operations",             "slug": "operations", "color": "#F59E0B",
     "description": "Facilities, logistics, procurement, maintenance — submits tickets only"},
]
