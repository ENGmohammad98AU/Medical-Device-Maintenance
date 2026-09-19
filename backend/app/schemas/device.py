"""
Device Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.device import DeviceType, DeviceStatus


class DeviceBase(BaseModel):
    """Base device schema"""
    name: str = Field(..., min_length=2, max_length=100)
    type: DeviceType
    manufacturer: str = Field(..., min_length=2, max_length=100)
    model: str = Field(..., min_length=1, max_length=50)
    serial_number: str = Field(..., min_length=1, max_length=50)
    department: str = Field(..., min_length=2, max_length=50)
    location: Optional[str] = None
    purchase_date: Optional[datetime] = None
    warranty_expiry: Optional[datetime] = None
    notes: Optional[str] = None


class DeviceCreate(DeviceBase):
    """Device creation schema"""
    status: DeviceStatus = DeviceStatus.OPERATIONAL


class DeviceUpdate(BaseModel):
    """Device update schema"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    type: Optional[DeviceType] = None
    manufacturer: Optional[str] = Field(None, min_length=2, max_length=100)
    model: Optional[str] = Field(None, min_length=1, max_length=50)
    serial_number: Optional[str] = Field(None, min_length=1, max_length=50)
    department: Optional[str] = Field(None, min_length=2, max_length=50)
    status: Optional[DeviceStatus] = None
    location: Optional[str] = None
    purchase_date: Optional[datetime] = None
    warranty_expiry: Optional[datetime] = None
    notes: Optional[str] = None


class DeviceInDB(DeviceBase):
    """Device in database schema"""
    id: int
    status: DeviceStatus
    last_maintenance: Optional[datetime]
    health_score: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Device(DeviceInDB):
    """Device response schema"""
    pass


class DeviceHealth(BaseModel):
    """Device health score schema"""
    device_id: int
    health_score: int
    fault_frequency: int
    repeated_faults: int
    device_age_days: Optional[int]
    downtime_hours: Optional[float]
