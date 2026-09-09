"""
Fault reference rule model for the primary medical device troubleshooting database.
Preserves workbook sheet data and rule details in a structured relational table.
"""

from sqlalchemy import Column, Integer, String, Text, Float
from sqlalchemy.orm import relationship
from app.database.base import Base, TimestampMixin


class FaultReferenceRule(Base, TimestampMixin):
    """Primary permanent local troubleshooting reference rule."""

    __tablename__ = "fault_reference_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(String, unique=True, index=True, nullable=False)
    sheet_name = Column(String, nullable=False)
    device_id = Column(String, nullable=True)
    device_name = Column(String, nullable=False)
    manufacturer = Column(String, nullable=False)
    model = Column(String, nullable=False)
    device_type = Column(String, nullable=False)
    fault_code = Column(String, nullable=True)
    alarm_code = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    meaning = Column(Text, nullable=True)
    severity = Column(String, nullable=False)
    original_alarm_priority = Column(String, nullable=True)
    possible_causes = Column(Text, nullable=True)
    immediate_safety_action = Column(Text, nullable=True)
    troubleshooting_steps = Column(Text, nullable=True)
    recommended_solution = Column(Text, nullable=True)
    verification_before_return_to_service = Column(Text, nullable=True)
    source = Column(Text, nullable=True)
    reference_url = Column(Text, nullable=True)
    reference_page = Column(String, nullable=True)
    aliases = Column(Text, nullable=True)
    match_confidence = Column(Float, default=0.0, nullable=False)
    match_status = Column(String, default="UNVERIFIED", nullable=False)
