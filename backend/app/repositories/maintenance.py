"""
Maintenance Record Repository
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from app.models.maintenance import MaintenanceRecord, MaintenanceType, MaintenanceStatus
from app.schemas.maintenance import MaintenanceRecordCreate, MaintenanceRecordUpdate


class MaintenanceRepository:
    """Maintenance record repository for data access"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create(self, maintenance_data: MaintenanceRecordCreate, performed_by: int) -> MaintenanceRecord:
        """Create a new maintenance record"""
        db_maintenance = MaintenanceRecord(**maintenance_data.model_dump(), performed_by=performed_by)
        self.db.add(db_maintenance)
        self.db.commit()
        self.db.refresh(db_maintenance)
        return db_maintenance
    
    def get_by_id(self, maintenance_id: int) -> Optional[MaintenanceRecord]:
        """Get maintenance record by ID"""
        return self.db.query(MaintenanceRecord).filter(MaintenanceRecord.id == maintenance_id).first()
    
    def get_all(self, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get all maintenance records"""
        return self.db.query(MaintenanceRecord).order_by(MaintenanceRecord.scheduled_date.desc()).offset(skip).limit(limit).all()
    
    def get_by_device(self, device_id: int, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get maintenance records by device"""
        return self.db.query(MaintenanceRecord).filter(MaintenanceRecord.device_id == device_id).order_by(MaintenanceRecord.scheduled_date.desc()).offset(skip).limit(limit).all()
    
    def get_by_type(self, maintenance_type: MaintenanceType, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get maintenance records by type"""
        return self.db.query(MaintenanceRecord).filter(MaintenanceRecord.type == maintenance_type).order_by(MaintenanceRecord.scheduled_date.desc()).offset(skip).limit(limit).all()
    
    def get_by_status(self, status: MaintenanceStatus, skip: int = 0, limit: int = 100) -> List[MaintenanceRecord]:
        """Get maintenance records by status"""
        return self.db.query(MaintenanceRecord).filter(MaintenanceRecord.status == status).order_by(MaintenanceRecord.scheduled_date.desc()).offset(skip).limit(limit).all()
    
    def get_upcoming(self, days: int = 7) -> List[MaintenanceRecord]:
        """Get upcoming maintenance in next N days"""
        from datetime import timedelta
        future_date = datetime.utcnow() + timedelta(days=days)
        return self.db.query(MaintenanceRecord).filter(
            MaintenanceRecord.status == MaintenanceStatus.SCHEDULED,
            MaintenanceRecord.scheduled_date <= future_date
        ).order_by(MaintenanceRecord.scheduled_date.asc()).all()
    
    def get_overdue(self) -> List[MaintenanceRecord]:
        """Get overdue maintenance records"""
        return self.db.query(MaintenanceRecord).filter(
            MaintenanceRecord.status == MaintenanceStatus.SCHEDULED,
            MaintenanceRecord.scheduled_date < datetime.utcnow()
        ).order_by(MaintenanceRecord.scheduled_date.asc()).all()
    
    def update(self, maintenance_id: int, maintenance_data: MaintenanceRecordUpdate) -> Optional[MaintenanceRecord]:
        """Update maintenance record"""
        db_maintenance = self.get_by_id(maintenance_id)
        if not db_maintenance:
            return None
        
        update_data = maintenance_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_maintenance, field, value)
        
        self.db.commit()
        self.db.refresh(db_maintenance)
        return db_maintenance
    
    def complete(self, maintenance_id: int) -> Optional[MaintenanceRecord]:
        """Complete maintenance record"""
        db_maintenance = self.get_by_id(maintenance_id)
        if not db_maintenance:
            return None
        
        db_maintenance.status = MaintenanceStatus.COMPLETED
        db_maintenance.completed_date = datetime.utcnow()
        self.db.commit()
        self.db.refresh(db_maintenance)
        return db_maintenance
    
    def delete(self, maintenance_id: int) -> bool:
        """Delete maintenance record"""
        db_maintenance = self.get_by_id(maintenance_id)
        if not db_maintenance:
            return False
        
        self.db.delete(db_maintenance)
        self.db.commit()
        return True
