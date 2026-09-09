"""
Maintenance Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.maintenance import MaintenanceType, MaintenanceStatus


class MaintenanceRecordBase(BaseModel):
    """Base maintenance record schema"""
    device_id: int
    type: MaintenanceType
    scheduled_date: datetime
    description: str = Field(..., min_length=10, max_length=2000)
    parts_used: Optional[str] = None
    cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class MaintenanceRecordCreate(MaintenanceRecordBase):
    """Maintenance record creation schema"""
    status: MaintenanceStatus = MaintenanceStatus.SCHEDULED


class MaintenanceRecordUpdate(BaseModel):
    """Maintenance record update schema"""
    status: Optional[MaintenanceStatus] = None
    completed_date: Optional[datetime] = None
    parts_used: Optional[str] = None
    cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class MaintenanceRecordInDB(MaintenanceRecordBase):
    """Maintenance record in database schema"""
    id: int
    performed_by: int
    status: MaintenanceStatus
    completed_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MaintenanceRecord(MaintenanceRecordInDB):
    """Maintenance record response schema"""
    pass
