"""
Maintenance Record Model
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Enum
from sqlalchemy.orm import relationship
from app.database.base import Base, TimestampMixin
import enum


class MaintenanceType(str, enum.Enum):
    """Maintenance types"""
    PREVENTIVE = "preventive"
    CORRECTIVE = "corrective"
    CALIBRATION = "calibration"
    INSPECTION = "inspection"


class MaintenanceStatus(str, enum.Enum):
    """Maintenance status"""
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MaintenanceRecord(Base, TimestampMixin):
    """Maintenance record model"""
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(Enum(MaintenanceType), nullable=False)
    status = Column(Enum(MaintenanceStatus), default=MaintenanceStatus.SCHEDULED, nullable=False)
    scheduled_date = Column(DateTime, nullable=False)
    completed_date = Column(DateTime, nullable=True)
    description = Column(Text, nullable=False)
    parts_used = Column(Text, nullable=True)
    cost = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    
    # Relationships
    device = relationship("Device", back_populates="maintenance_records", lazy="joined")
