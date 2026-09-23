"""
Fault Report Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.fault_report import FaultSeverity, FaultStatus


class FaultReportBase(BaseModel):
    """Base fault report schema"""
    device_id: int
    alarm_code: Optional[str] = None
    error_message: str = Field(..., min_length=1, max_length=500)
    description: str = Field(default="", min_length=0, max_length=2000)
    severity: FaultSeverity = FaultSeverity.MEDIUM
    image_url: Optional[str] = None


class FaultReportCreate(FaultReportBase):
    """Fault report creation schema"""
    pass


class FaultReportUpdate(BaseModel):
    """Fault report update schema"""
    device_id: Optional[int] = None
    alarm_code: Optional[str] = None
    error_message: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, min_length=0, max_length=2000)
    severity: Optional[FaultSeverity] = None
    status: Optional[FaultStatus] = None
    engineer_notes: Optional[str] = None
    ai_analysis: Optional[str] = None
    ai_confidence: Optional[int] = Field(None, ge=0, le=100)


class FaultReportInDB(FaultReportBase):
    """Fault report in database schema"""
    id: int
    reported_by: int
    status: FaultStatus
    ai_analysis: Optional[str]
    ai_confidence: Optional[int]
    engineer_notes: Optional[str]
    resolved_at: Optional[datetime]
    resolved_by: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FaultReport(FaultReportInDB):
    """Fault report response schema"""
    pass


class AIAnalysisResult(BaseModel):
    """AI analysis result schema"""
    device: str
    manufacturer: str
    model: str
    alarm: str
    department: str
    severity: FaultSeverity
    confidence: int
    priority: str
    references: list[str]
    possible_cause: str
    initial_inspection: str
    escalation_recommendation: str
    is_demo: bool = False
