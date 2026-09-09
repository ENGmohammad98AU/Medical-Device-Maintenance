"""
Fault Report Service
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.fault_report import FaultReport, FaultSeverity, FaultStatus
from app.schemas.fault_report import FaultReportCreate, FaultReportUpdate
from app.repositories.fault_report import FaultReportRepository


class FaultReportService:
    """Fault report service for business logic"""
    
    def __init__(self, db: Session):
        self.db = db
        self.repository = FaultReportRepository(db)
    
    def create_fault_report(self, report_data: FaultReportCreate, reported_by: int) -> FaultReport:
        """Create a new fault report"""
        return self.repository.create(report_data, reported_by)
    
    def get_fault_report(self, report_id: int) -> Optional[FaultReport]:
        """Get fault report by ID"""
        return self.repository.get_by_id(report_id)
    
    def get_all_fault_reports(self, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get all fault reports"""
        return self.repository.get_all(skip, limit)
    
    def get_fault_reports_by_device(self, device_id: int, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get fault reports by device"""
        return self.repository.get_by_device(device_id, skip, limit)
    
    def get_fault_reports_by_severity(self, severity: FaultSeverity, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get fault reports by severity"""
        return self.repository.get_by_severity(severity, skip, limit)
    
    def get_fault_reports_by_status(self, status: FaultStatus, skip: int = 0, limit: int = 100) -> List[FaultReport]:
        """Get fault reports by status"""
        return self.repository.get_by_status(status, skip, limit)
    
    def get_critical_reports(self) -> List[FaultReport]:
        """Get all critical fault reports"""
        return self.repository.get_critical_reports()
    
    def get_open_reports(self) -> List[FaultReport]:
        """Get all open fault reports"""
        return self.repository.get_open_reports()
    
    def update_fault_report(self, report_id: int, report_data: FaultReportUpdate) -> Optional[FaultReport]:
        """Update fault report"""
        return self.repository.update(report_id, report_data)
    
    def resolve_fault_report(self, report_id: int, resolved_by: int) -> Optional[FaultReport]:
        """Resolve fault report"""
        return self.repository.resolve(report_id, resolved_by)
    
    def delete_fault_report(self, report_id: int) -> bool:
        """Delete fault report"""
        return self.repository.delete(report_id)
