"""
Fault Report Repository
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.fault_report import FaultReport, FaultSeverity, FaultStatus
from app.schemas.fault_report import FaultReportCreate, FaultReportUpdate
from app.services.fault_resolution_workflow_service import FaultResolutionWorkflowService


class FaultReportRepository:
    """Fault report repository for data access"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create(self, report_data: FaultReportCreate, reported_by: int) -> FaultReport:
        """Create a new fault report"""
        db_report = FaultReport(
            **report_data.model_dump(),
            reported_by=reported_by
        )
        self.db.add(db_report)
        self.db.commit()
        self.db.refresh(db_report)
        return db_report
    
    def get_by_id(self, report_id: int) -> Optional[FaultReport]:
        """Get fault report by ID"""
        return self.db.query(FaultReport).filter(FaultReport.id == report_id).first()
    
    def get_all(self, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get all fault reports"""
        return self.db.query(FaultReport).order_by(FaultReport.created_at.desc()).offset(skip).limit(limit).all()
    
    def get_by_device(self, device_id: int, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get fault reports by device"""
        return self.db.query(FaultReport).filter(FaultReport.device_id == device_id).order_by(FaultReport.created_at.desc()).offset(skip).limit(limit).all()
    
    def get_by_severity(self, severity: FaultSeverity, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get fault reports by severity"""
        return self.db.query(FaultReport).filter(FaultReport.severity == severity).order_by(FaultReport.created_at.desc()).offset(skip).limit(limit).all()
    
    def get_by_status(self, status: FaultStatus, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get fault reports by status"""
        return self.db.query(FaultReport).filter(FaultReport.status == status).order_by(FaultReport.created_at.desc()).offset(skip).limit(limit).all()
    
    def get_critical_reports(self) -> List[FaultReport]:
        """Get all critical fault reports"""
        return self.db.query(FaultReport).filter(FaultReport.severity == FaultSeverity.CRITICAL).filter(FaultReport.status == FaultStatus.OPEN).all()
    
    def get_open_reports(self) -> List[FaultReport]:
        """Get all open fault reports"""
        return self.db.query(FaultReport).filter(FaultReport.status == FaultStatus.OPEN).all()
    
    def update(self, report_id: int, report_data: FaultReportUpdate) -> Optional[FaultReport]:
        """Update fault report"""
        db_report = self.get_by_id(report_id)
        if not db_report:
            return None
        
        update_data = report_data.model_dump(exclude_unset=True)
        FaultResolutionWorkflowService(self.db).prepare_report_update(db_report, update_data)
        for field, value in update_data.items():
            setattr(db_report, field, value)
        
        self.db.commit()
        self.db.refresh(db_report)
        return db_report
    
    def resolve(self, report_id: int, resolved_by: int) -> Optional[FaultReport]:
        """Resolve fault report"""
        db_report = self.get_by_id(report_id)
        if not db_report:
            return None
        
        workflow = FaultResolutionWorkflowService(self.db).get(report_id)
        if not workflow or workflow.outcome != "RESOLVED" or db_report.status != FaultStatus.RESOLVED:
            raise ValueError("وثّق الإجراء المنفذ ونتيجة التحقق قبل إغلاق البلاغ.")
        return db_report
    
    def delete(self, report_id: int) -> bool:
        """Delete fault report"""
        db_report = self.get_by_id(report_id)
        if not db_report:
            return False
        
        self.db.delete(db_report)
        self.db.commit()
        return True
