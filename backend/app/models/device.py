"""
Device Model
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.database.base import Base, TimestampMixin
import enum


class DeviceType(str, enum.Enum):
    """Device types"""
    VENTILATOR = "ventilator"
    PATIENT_MONITOR = "patient_monitor"
    SYRINGE_PUMP = "syringe_pump"
    INFUSION_PUMP = "infusion_pump"
    DEFIBRILLATOR = "defibrillator"
    ECG_MACHINE = "ecg_machine"
    ULTRASOUND = "ultrasound"
    XRAY_MACHINE = "xray_machine"
    MRI_MACHINE = "mri_machine"
    CT_SCANNER = "ct_scanner"


class DeviceStatus(str, enum.Enum):
    """Device status"""
    OPERATIONAL = "operational"
    OUT_OF_SERVICE = "out_of_service"
    MAINTENANCE_REQUIRED = "maintenance_required"
    UNDER_MAINTENANCE = "under_maintenance"
    RETIRED = "retired"


class Device(Base, TimestampMixin):
    """Device model"""
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(Enum(DeviceType), nullable=False)
    manufacturer = Column(String, nullable=False)
    model = Column(String, nullable=False)
    serial_number = Column(String, unique=True, index=True, nullable=False)
    department = Column(String, nullable=False)
    status = Column(Enum(DeviceStatus), default=DeviceStatus.OPERATIONAL, nullable=False)
    location = Column(String, nullable=True)
    purchase_date = Column(DateTime, nullable=True)
    warranty_expiry = Column(DateTime, nullable=True)
    last_maintenance = Column(DateTime, nullable=True)
    health_score = Column(Integer, default=100, nullable=False)
    notes = Column(String, nullable=True)
    
    # Relationships
    maintenance_records = relationship("MaintenanceRecord", back_populates="device", lazy="dynamic")
    fault_reports = relationship("FaultReport", back_populates="device", lazy="dynamic")
