"""Persistent end-to-end workflow for an analyzed fault report."""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from app.database.base import Base, TimestampMixin


class FaultResolutionWorkflow(Base, TimestampMixin):
    """Links LLM analysis, human review, executed action, and verified outcome."""

    __tablename__ = "fault_resolution_workflows"

    id = Column(Integer, primary_key=True, index=True)
    fault_report_id = Column(Integer, ForeignKey("fault_reports.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # Analysis provenance
    audit_log_id = Column(String, nullable=True, index=True)
    classification_source = Column(String, nullable=True)
    fault_category = Column(String, nullable=True)
    routing_target = Column(String, nullable=True)
    llm_status = Column(String, nullable=True)
    llm_provider = Column(String, nullable=True)
    llm_model = Column(String, nullable=True)
    llm_revision = Column(String, nullable=True)
    llm_latency_ms = Column(Float, nullable=True)
    total_processing_time_ms = Column(Float, nullable=True)

    # Server-owned recommendation/reference snapshot
    selected_reference_id = Column(String, nullable=True)
    reference_source = Column(Text, nullable=True)
    recommended_solution = Column(Text, nullable=True)
    verification_instructions = Column(Text, nullable=True)

    # Human review
    specialist_decision = Column(String, nullable=True)
    specialist_comments = Column(Text, nullable=True)
    decision_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    decision_at = Column(DateTime, nullable=True)

    # Executed action and verification
    action_taken = Column(Text, nullable=True)
    verification_result = Column(Text, nullable=True)
    outcome = Column(String, nullable=False, default="PENDING")
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime, nullable=True)

    # Reopen trace
    reopen_reason = Column(Text, nullable=True)
    reopened_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reopened_at = Column(DateTime, nullable=True)
