"""
Fault Reports API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.database.connection import get_db
from app.api.dependencies import get_current_active_user, require_roles
from app.models.user import User, UserRole
from app.schemas.fault_report import FaultReportCreate, FaultReportUpdate, FaultReport, AIAnalysisResult
from app.services.fault_report_service import FaultReportService
from app.ai.pipeline.ai_service import AIService


class FaultAnalysisRequest(BaseModel):
    """Fault analysis request"""
    device_id: int
    alarm_code: Optional[str] = None
    error_message: str


router = APIRouter(prefix="/api/fault-reports", tags=["Fault Reports"])


@router.post("/", response_model=FaultReport, status_code=status.HTTP_201_CREATED)
def create_fault_report(
    report_data: FaultReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new fault report"""
    fault_service = FaultReportService(db)
    return fault_service.create_fault_report(report_data, current_user.id)


@router.get("/", response_model=List[FaultReport])
def get_fault_reports(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all fault reports"""
    fault_service = FaultReportService(db)
    return fault_service.get_all_fault_reports(skip, limit)


@router.get("/critical", response_model=List[FaultReport])
def get_critical_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all critical fault reports"""
    fault_service = FaultReportService(db)
    return fault_service.get_critical_reports()


@router.get("/open", response_model=List[FaultReport])
def get_open_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all open fault reports"""
    fault_service = FaultReportService(db)
    return fault_service.get_open_reports()


@router.get("/{report_id}", response_model=FaultReport)
def get_fault_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get fault report by ID"""
    fault_service = FaultReportService(db)
    report = fault_service.get_fault_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Fault report not found")
    return report


@router.get("/device/{device_id}", response_model=List[FaultReport])
def get_fault_reports_by_device(
    device_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get fault reports by device"""
    fault_service = FaultReportService(db)
    return fault_service.get_fault_reports_by_device(device_id, skip, limit)


@router.put("/{report_id}", response_model=FaultReport)
def update_fault_report(
    report_id: int,
    report_data: FaultReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER, UserRole.MEDICAL_TECHNICIAN))
):
    """Update fault report"""
    fault_service = FaultReportService(db)
    report = fault_service.update_fault_report(report_id, report_data)
    if not report:
        raise HTTPException(status_code=404, detail="Fault report not found")
    return report


@router.post("/{report_id}/resolve", response_model=FaultReport)
def resolve_fault_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER, UserRole.MEDICAL_TECHNICIAN))
):
    """Resolve fault report"""
    fault_service = FaultReportService(db)
    report = fault_service.resolve_fault_report(report_id, current_user.id)
    if not report:
        raise HTTPException(status_code=404, detail="Fault report not found")
    return report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fault_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR))
):
    """Delete fault report"""
    fault_service = FaultReportService(db)
    if not fault_service.delete_fault_report(report_id):
        raise HTTPException(status_code=404, detail="Fault report not found")


@router.post("/analyze", response_model=AIAnalysisResult)
def analyze_fault(
    request: FaultAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Analyze fault using AI"""
    ai_service = AIService(db)
    try:
        return ai_service.analyze_fault(
            request.device_id,
            request.alarm_code,
            request.error_message
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
