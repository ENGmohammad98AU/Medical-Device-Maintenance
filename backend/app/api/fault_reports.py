"""
Fault Reports API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from app.database.connection import get_db
from app.api.dependencies import get_current_active_user, require_roles
from app.models.user import User, UserRole
from app.schemas.fault_report import FaultReportCreate, FaultReportUpdate, FaultReport
from app.services.fault_report_service import FaultReportService
from app.services.fault_resolution_workflow_service import FaultResolutionWorkflowService
from app.services.browser_llm_service import BrowserLLMResult
from app.api.intelligent_support import (
    FaultAnalysisRequest as IntelligentFaultAnalysisRequest,
    FaultAnalysisResponse as IntelligentFaultAnalysisResponse,
    analyze_fault as analyze_intelligent_fault,
)


class FaultAnalysisRequest(BaseModel):
    """Backward-compatible request routed through the unified intelligent-support pipeline."""
    device_id: int
    report_id: Optional[int] = None
    alarm_code: Optional[str] = None
    error_message: str = Field(..., min_length=10, max_length=4000)
    patient_connected: bool = False
    customer_expertise: str = "INTERMEDIATE"
    browser_llm: Optional[BrowserLLMResult] = None


class ResolutionVerificationRequest(BaseModel):
    action_taken: str = Field(..., min_length=3, max_length=4000)
    verification_result: str = Field(..., min_length=3, max_length=4000)
    outcome: str = Field(..., description="RESOLVED, FAILED, or FOLLOW_UP")


class ReopenRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)


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


@router.post("/analyze", response_model=IntelligentFaultAnalysisResponse)
def analyze_fault(
    request: FaultAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Compatibility endpoint: all report analysis now uses the same LLM/reference/safety pipeline."""
    linked_report_id = request.report_id
    if linked_report_id is None:
        matching = (
            FaultReportService(db).get_fault_reports_by_device(request.device_id, 0, 1000)
        )
        normalized = request.error_message.strip()
        linked = next((item for item in matching if item.error_message.strip() == normalized and item.status.value != "resolved"), None)
        linked_report_id = linked.id if linked else None
    intelligent_request = IntelligentFaultAnalysisRequest(
        device_id=request.device_id,
        report_id=linked_report_id,
        fault=request.alarm_code or "",
        description=request.error_message,
        patient_connected=request.patient_connected,
        customer_expertise=request.customer_expertise,
        browser_llm=request.browser_llm,
    )
    return analyze_intelligent_fault(intelligent_request, db=db, current_user=current_user)


@router.get("/{report_id}/workflow")
def get_fault_workflow(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    workflow = FaultResolutionWorkflowService(db).get(report_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Fault workflow not found")
    return FaultResolutionWorkflowService.to_dict(workflow)


@router.post("/{report_id}/verify-resolution")
def verify_fault_resolution(
    report_id: int,
    payload: ResolutionVerificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER, UserRole.MEDICAL_TECHNICIAN)),
):
    try:
        workflow = FaultResolutionWorkflowService(db).verify_resolution(
            report_id,
            action_taken=payload.action_taken,
            verification_result=payload.verification_result,
            outcome=payload.outcome,
            user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return FaultResolutionWorkflowService.to_dict(workflow)


@router.post("/{report_id}/reopen")
def reopen_fault_report(
    report_id: int,
    payload: ReopenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER, UserRole.MEDICAL_TECHNICIAN)),
):
    try:
        workflow = FaultResolutionWorkflowService(db).reopen(report_id, reason=payload.reason, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return FaultResolutionWorkflowService.to_dict(workflow)


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
    """Return an already verified resolved report; direct unverified closure is prohibited."""
    fault_service = FaultReportService(db)
    report = fault_service.get_fault_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Fault report not found")
    workflow = FaultResolutionWorkflowService(db).get(report_id)
    if workflow is None or workflow.outcome != "RESOLVED":
        raise HTTPException(status_code=409, detail="Record the executed action and verification result through /verify-resolution before closing the report")
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


