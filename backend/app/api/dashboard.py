"""
Dashboard API Endpoints
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.database.connection import get_db
from app.api.dependencies import get_current_active_user
from app.models.user import User
from app.models.device import Device, DeviceStatus
from app.models.fault_report import FaultReport, FaultSeverity, FaultStatus
from app.models.audit_log import AuditLog


router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get dashboard statistics"""
    
    # Get today's date
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    
    # Critical reports today
    critical_today = db.query(FaultReport).filter(
        FaultReport.severity == FaultSeverity.CRITICAL,
        FaultReport.created_at >= today_start
    ).count()
    
    # Open reports
    open_reports = db.query(FaultReport).filter(
        FaultReport.status == FaultStatus.OPEN
    ).count()
    
    # Resolved reports
    resolved_reports = db.query(FaultReport).filter(
        FaultReport.status == FaultStatus.RESOLVED
    ).count()
    
    # Out of service devices
    out_of_service = db.query(Device).filter(
        Device.status == DeviceStatus.OUT_OF_SERVICE
    ).count()
    
    # Total devices
    total_devices = db.query(Device).count()
    
    # Average confidence of successful reference-grounded maintenance analyses.
    # The maintenance workflow persists its result in AuditLog on a 0..1 scale;
    # FaultReport.ai_confidence belongs to the separate legacy report workflow
    # and is commonly NULL, which previously made this card display 0%.
    avg_confidence = db.query(func.avg(AuditLog.confidence_score)).filter(
        AuditLog.action == "FAULT_ANALYSIS",
        AuditLog.confidence_score > 0,
    ).scalar()
    
    # Average response time (time to resolve). Calculate in Python so the
    # query stays portable across PostgreSQL and SQLite.
    resolved_rows = db.query(FaultReport.created_at, FaultReport.resolved_at).filter(
        FaultReport.status == FaultStatus.RESOLVED,
        FaultReport.resolved_at.isnot(None)
    ).all()
    resolved_minutes = [
        (resolved_at - created_at).total_seconds() / 60.0
        for created_at, resolved_at in resolved_rows
        if created_at and resolved_at and resolved_at >= created_at
    ]
    resolved_with_time = (sum(resolved_minutes) / len(resolved_minutes)) if resolved_minutes else 0.0
    
    return {
        "critical_reports_today": critical_today,
        "open_reports": open_reports,
        "resolved_reports": resolved_reports,
        "out_of_service_devices": out_of_service,
        "total_devices": total_devices,
        "ai_confidence": round(float(avg_confidence) * 100, 2) if avg_confidence is not None else 0,
        "average_response_time_minutes": round(resolved_with_time, 2) if resolved_with_time else 0
    }


@router.get("/recent-critical-reports")
def get_recent_critical_reports(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get recent critical fault reports"""
    reports = db.query(FaultReport).filter(
        FaultReport.severity == FaultSeverity.CRITICAL
    ).order_by(FaultReport.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": report.id,
            "device_id": report.device_id,
            "error_message": report.error_message,
            "severity": report.severity.value,
            "status": report.status.value,
            "created_at": report.created_at.isoformat(),
            "department": report.device.department if report.device else None
        }
        for report in reports
    ]


@router.get("/faults-by-department")
def get_faults_by_department(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get fault count by department"""
    from sqlalchemy import case
    
    result = db.query(
        Device.department,
        func.count(FaultReport.id).label('count')
    ).join(
        FaultReport, Device.id == FaultReport.device_id
    ).group_by(
        Device.department
    ).all()
    
    return [
        {"department": dept, "count": count}
        for dept, count in result
    ]


@router.get("/most-faulty-devices")
def get_most_faulty_devices(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get devices with most faults"""
    result = db.query(
        Device.id,
        Device.name,
        Device.model,
        Device.serial_number,
        Device.department,
        func.count(FaultReport.id).label('fault_count')
    ).join(
        FaultReport, Device.id == FaultReport.device_id
    ).group_by(
        Device.id
    ).order_by(
        func.count(FaultReport.id).desc()
    ).limit(limit).all()
    
    return [
        {
            "id": device_id,
            "name": name,
            "model": model,
            "serial_number": serial_number,
            "department": department,
            "fault_count": fault_count
        }
        for device_id, name, model, serial_number, department, fault_count in result
    ]


@router.get("/device-health-scores")
def get_device_health_scores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all device health scores"""
    devices = db.query(Device).all()
    
    return [
        {
            "id": device.id,
            "name": device.name,
            "type": device.type.value,
            "department": device.department,
            "health_score": device.health_score,
            "status": device.status.value
        }
        for device in devices
    ]
