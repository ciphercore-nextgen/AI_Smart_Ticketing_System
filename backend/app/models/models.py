from sqlalchemy import (
    Column, String, Boolean, DateTime, Text,
    ForeignKey, JSON, Enum as SAEnum, Integer
)
from sqlalchemy.orm import relationship, DeclarativeBase
from datetime import datetime, timezone
import uuid
import enum


def utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    employee   = "employee"
    ai_intern  = "ai_intern"
    it_support = "it_support_technician"
    junior_ops = "junior_operations"
    admin      = "admin"
    super_admin = "super_admin"


class TicketStatus(str, enum.Enum):
    open             = "open"
    pending          = "pending"
    assigned         = "assigned"
    in_progress      = "in_progress"
    escalated        = "escalated"
    waiting_for_user = "waiting_for_user"
    resolved         = "resolved"
    closed           = "closed"


class TicketPriority(str, enum.Enum):
    critical = "critical"
    high     = "high"
    medium   = "medium"
    low      = "low"


# ─── Department ───────────────────────────────────────────────────────────────

class Department(Base):
    __tablename__ = "departments"

    id               = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name             = Column(String(100), nullable=False, unique=True)
    slug             = Column(String(50), nullable=False, unique=True)
    color            = Column(String(10), default="#3B82F6")
    description      = Column(Text, nullable=True)
    routed_agent_role = Column(String(50), nullable=True)
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=utcnow)

    users   = relationship("User", back_populates="department")
    tickets = relationship("Ticket", back_populates="department")


# ─── User ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id               = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email            = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password  = Column(String(255), nullable=False)
    full_name        = Column(String(200), nullable=False)
    role             = Column(SAEnum(UserRole), nullable=False, default=UserRole.employee)
    employee_id      = Column(String(50), unique=True, nullable=True)

    department_id    = Column(String(36), ForeignKey("departments.id"), nullable=True)
    agent_departments = Column(JSON, default=list)
    agent_role_key   = Column(String(50), nullable=True)

    job_title        = Column(String(100), nullable=True)
    office_location  = Column(String(100), nullable=True)
    avatar_url       = Column(String(500), nullable=True)
    is_active        = Column(Boolean, default=True)
    permissions      = Column(JSON, default=list)
    # Lightweight approval authority, independent of the agent/admin role
    # system — lets an admin designate "managers" for the approval workflow
    # without reworking the whole role enum.
    can_approve      = Column(Boolean, default=False)
    last_login       = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, default=utcnow)
    updated_at       = Column(DateTime, default=utcnow, onupdate=utcnow)

    department        = relationship("Department", back_populates="users")
    submitted_tickets = relationship("Ticket", foreign_keys="Ticket.submitted_by_id", back_populates="submitter")
    assigned_tickets  = relationship("Ticket", foreign_keys="Ticket.assigned_agent_id", back_populates="assigned_agent")
    comments          = relationship("TicketComment", back_populates="author")
    refresh_tokens    = relationship("RefreshToken", back_populates="user")


# ─── Ticket ───────────────────────────────────────────────────────────────────

class Ticket(Base):
    __tablename__ = "tickets"

    id             = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_number  = Column(String(20), unique=True, nullable=False, index=True)

    title          = Column(String(500), nullable=False)
    description    = Column(Text, nullable=False)
    status         = Column(SAEnum(TicketStatus), default=TicketStatus.open, nullable=False)
    priority       = Column(SAEnum(TicketPriority), default=TicketPriority.medium, nullable=False)

    submitted_by_id   = Column(String(36), ForeignKey("users.id"), nullable=False)
    department_id     = Column(String(36), ForeignKey("departments.id"), nullable=True)
    assigned_agent_id = Column(String(36), ForeignKey("users.id"), nullable=True)

    ai_classification = Column(JSON, nullable=True)
    sla_deadline      = Column(DateTime, nullable=True)
    sla_breached      = Column(Boolean, default=False)
    is_escalated      = Column(Boolean, default=False)
    resolution_note   = Column(Text, nullable=True)

    # Self-help outcome tracking
    self_help_shown      = Column(Boolean, default=False)
    self_help_resolved   = Column(Boolean, nullable=True)   # True=fixed, False=not fixed, None=no response
    self_help_steps_done = Column(JSON, nullable=True)      # list of step order numbers completed
    self_help_outcome_at = Column(DateTime, nullable=True)  # when employee reported outcome
    self_help_content    = Column(JSON, nullable=True)      # cached generated steps, so reloads are stable

    # Approval workflow — set when an automation rule matches at creation
    requires_approval = Column(Boolean, default=False)
    approval_status   = Column(String(20), nullable=True)   # None|pending|approved|rejected
    approved_by_id    = Column(String(36), ForeignKey("users.id"), nullable=True)
    approved_at       = Column(DateTime, nullable=True)
    approval_note     = Column(Text, nullable=True)

    created_at  = Column(DateTime, default=utcnow)
    updated_at  = Column(DateTime, default=utcnow, onupdate=utcnow)
    resolved_at = Column(DateTime, nullable=True)

    submitter      = relationship("User", foreign_keys=[submitted_by_id], back_populates="submitted_tickets")
    department     = relationship("Department", back_populates="tickets")
    assigned_agent = relationship("User", foreign_keys=[assigned_agent_id], back_populates="assigned_tickets")
    approved_by    = relationship("User", foreign_keys=[approved_by_id])
    comments       = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan")
    audit_logs     = relationship("AuditLog", back_populates="ticket", cascade="all, delete-orphan")


# ─── Ticket Comment ───────────────────────────────────────────────────────────

class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id   = Column(String(36), ForeignKey("tickets.id"), nullable=False)
    author_id   = Column(String(36), ForeignKey("users.id"), nullable=False)
    content     = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=False)
    is_ai       = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=utcnow)

    ticket = relationship("Ticket", back_populates="comments")
    author = relationship("User", back_populates="comments")


# ─── Audit Log ────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id  = Column(String(36), ForeignKey("tickets.id"), nullable=True)
    user_id    = Column(String(36), ForeignKey("users.id"), nullable=True)
    action     = Column(String(100), nullable=False)
    details    = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    ticket = relationship("Ticket", back_populates="audit_logs")


# ─── AI Governance ────────────────────────────────────────────────────────────

class AILog(Base):
    """Every AI action the platform takes — classification, routing,
    self-help generation, report summaries, bias checks — for transparency
    and audit purposes."""
    __tablename__ = "ai_logs"

    id             = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id        = Column(String(36), ForeignKey("users.id"), nullable=True)
    ticket_id      = Column(String(36), ForeignKey("tickets.id"), nullable=True)
    action         = Column(String(100), nullable=False)   # e.g. "ticket_classification", "agent_routing"
    input_summary  = Column(Text, nullable=True)
    output_summary = Column(Text, nullable=True)
    risk_level     = Column(String(10), default="low")     # low | medium | high
    risk_notes     = Column(Text, nullable=True)
    model_used     = Column(String(100), nullable=True)
    created_at     = Column(DateTime, default=utcnow)


class RiskReport(Base):
    """A generated AI governance report — snapshot of risks found across
    recent AI activity, with recommendations and a compliance verdict."""
    __tablename__ = "risk_reports"

    id                 = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_id      = Column(String(36), ForeignKey("users.id"), nullable=True)
    feature_evaluated  = Column(String(200), nullable=False)
    period_days        = Column(Integer, default=7)
    risks_identified   = Column(JSON, default=list)
    recommendations    = Column(JSON, default=list)
    compliance_status  = Column(String(20), default="compliant")  # compliant | needs_review | non_compliant
    summary            = Column(Text, nullable=True)
    created_at         = Column(DateTime, default=utcnow)


# ─── Predictive Insights ──────────────────────────────────────────────────────

class Prediction(Base):
    """A forecasted ticket volume for a future date, generated by the
    trend model. actual_count gets filled in later for accuracy tracking."""
    __tablename__ = "predictions"

    id              = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    forecast_date   = Column(DateTime, nullable=False)
    department_slug = Column(String(50), nullable=True)  # None = company-wide
    predicted_count = Column(Integer, nullable=False)
    actual_count    = Column(Integer, nullable=True)
    method          = Column(String(50), default="trend")
    generated_at    = Column(DateTime, default=utcnow)


# ─── Workflow Automation ──────────────────────────────────────────────────────

class AutomationRule(Base):
    """Admin-configurable rules for the approval workflow — e.g. 'critical
    priority requires manager approval' or 'Finance department requires
    manager approval'."""
    __tablename__ = "automation_rules"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String(200), nullable=False)
    condition_type  = Column(String(30), nullable=False)   # "priority" | "department"
    condition_value = Column(String(50), nullable=False)   # e.g. "critical" | "finance"
    action          = Column(String(30), default="require_approval")
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=utcnow)


# ─── Refresh Token ────────────────────────────────────────────────────────────

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String(36), ForeignKey("users.id"), nullable=False)
    token      = Column(String(500), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked    = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="refresh_tokens")
