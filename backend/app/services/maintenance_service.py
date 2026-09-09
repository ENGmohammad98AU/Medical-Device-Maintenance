"""
Maintenance Service
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.maintenance import MaintenanceRecord, MaintenanceType, MaintenanceStatus
from app.schemas.maintenance import MaintenanceRecordCreate, MaintenanceRecordUpdate
from app.repositories.maintenance import MaintenanceRepository


class MaintenanceService:
    """Maintenance service for business logic"""
    
    def __init__(self, db: Session):
        self.db = db
        self.repository = MaintenanceRepository(db)
    
    def create_maintenance_record(self, maintenance_data: MaintenanceRecordCreate, performed_by: int) -> MaintenanceRecord:
        """Create a new maintenance record"""
        return self.repository.create(maintenance_data, performed_by)
    
    def get_maintenance_record(self, maintenance_id: int) -> Optional[MaintenanceRecord]:
        """Get maintenance record by ID"""
        return self.repository.get_by_id(maintenance_id)
    
    def get_all_maintenance_records(self, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get all maintenance records"""
        return self.repository.get_all(skip, limit)
    
    def get_maintenance_records_by_device(self, device_id: int, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get maintenance records by device"""
        return self.repository.get_by_device(device_id, skip, limit)
    
    def get_maintenance_records_by_type(self, maintenance_type: MaintenanceType, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get maintenance records by type"""
        return self.repository.get_by_type(maintenance_type, skip, limit)
    
    def get_maintenance_records_by_status(self, status: MaintenanceStatus, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get maintenance records by status"""
        return self.repository.get_by_status(status, skip, limit)
    
    def get_upcoming_maintenance(self, days: int = 7) -> List[MaintenanceRecord]:
        """Get upcoming maintenance in next N days"""
        return self.repository.get_upcoming(days)
    
    def get_overdue_maintenance(self) -> List[MaintenanceRecord]:
        """Get overdue maintenance records"""
        return self.repository.get_overdue()
    
    def update_maintenance_record(self, maintenance_id: int, maintenance_data: MaintenanceRecordUpdate) -> Optional[MaintenanceRecord]:
        """Update maintenance record"""
        return self.repository.update(maintenance_id, maintenance_data)
    
    def complete_maintenance_record(self, maintenance_id: int) -> Optional[MaintenanceRecord]:
        """Complete maintenance record"""
        return self.repository.complete(maintenance_id)
    
    def delete_maintenance_record(self, maintenance_id: int) -> bool:
        """Delete maintenance record"""
        return self.repository.delete(maintenance_id)
