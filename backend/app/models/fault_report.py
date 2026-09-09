"""
Fault Report Model
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.database.base import Base, TimestampMixin
import enum


class FaultSeverity(str, enum.Enum):
    """Fault severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FaultStatus(str, enum.Enum):
    """Fault report status"""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    REJECTED = "rejected"


class FaultReport(Base, TimestampMixin):
    """Fault report model"""
    __tablename__ = "fault_reports"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    alarm_code = Column(String, nullable=True)
    error_message = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(Enum(FaultSeverity), nullable=False)
    status = Column(Enum(FaultStatus), default=FaultStatus.OPEN, nullable=False)
    image_url = Column(String, nullable=True)
    ai_analysis = Column(Text, nullable=True)
    ai_confidence = Column(Integer, nullable=True)
    engineer_notes = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    device = relationship("Device", back_populates="fault_reports", lazy="joined")
