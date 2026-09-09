"""Persistent records used by duplicate detection and evaluation metrics."""

from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Float
from app.database.base import Base
from datetime import datetime


class DuplicateReportRecord(Base):
    __tablename__ = "duplicate_report_records"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String(128), unique=True, nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    device_type = Column(String(64), nullable=True, index=True)
    error_message = Column(Text, nullable=True)
    error_code = Column(String(128), nullable=True)
    department = Column(String(128), nullable=True)
    model = Column(String(128), nullable=True)
    fault_type = Column(String(64), nullable=True, index=True)
    device_identifier = Column(String(128), nullable=True)


class EvaluationEvent(Base):
    __tablename__ = "evaluation_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    payload = Column(JSON, nullable=False, default=dict)
    numeric_value = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
