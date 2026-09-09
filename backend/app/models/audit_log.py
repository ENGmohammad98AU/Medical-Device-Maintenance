"""Persistent audit log model for fault-analysis decisions."""

from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, JSON
from app.database.base import Base
from datetime import datetime


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    user_id = Column(String(64), nullable=False, index=True)
    user_role = Column(String(64), nullable=False)
    action = Column(String(64), nullable=False)

    original_input = Column(Text, nullable=False)
    cleaned_input = Column(Text, nullable=False)
    extracted_entities = Column(JSON, nullable=False, default=dict)
    classification_result = Column(JSON, nullable=False, default=dict)
    retrieved_chunks = Column(JSON, nullable=False, default=list)
    retrieval_scores = Column(JSON, nullable=False, default=list)
    sources = Column(JSON, nullable=False, default=list)
    generated_response = Column(Text, nullable=False, default="")
    confidence_score = Column(Float, nullable=False, default=0.0)
    safety_check_result = Column(JSON, nullable=False, default=dict)

    engineer_decision = Column(String(32), nullable=True)
    engineer_comments = Column(Text, nullable=True)
    decision_timestamp = Column(DateTime, nullable=True)

    processing_time_ms = Column(Float, nullable=False, default=0.0)
    requires_review = Column(Boolean, nullable=False, default=True)
    review_status = Column(String(32), nullable=False, default="PENDING", index=True)
