"""
Device Repository
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.device import Device, DeviceType, DeviceStatus
from app.schemas.device import DeviceCreate, DeviceUpdate


class DeviceRepository:
    """Device repository for data access"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create(self, device_data: DeviceCreate) -> Device:
        """Create a new device"""
        db_device = Device(**device_data.model_dump())
        self.db.add(db_device)
        self.db.commit()
        self.db.refresh(db_device)
        return db_device
    
    def get_by_id(self, device_id: int) -> Optional[Device]:
        """Get device by ID"""
        return self.db.query(Device).filter(Device.id == device_id).first()
    
    def get_by_serial_number(self, serial_number: str) -> Optional[Device]:
        """Get device by serial number"""
        return self.db.query(Device).filter(Device.serial_number == serial_number).first()
    
    def get_all(self, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get all devices"""
        return self.db.query(Device).offset(skip).limit(limit).all()
    
    def get_by_type(self, device_type: DeviceType, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get devices by type"""
        return self.db.query(Device).filter(Device.type == device_type).offset(skip).limit(limit).all()
    
    def get_by_department(self, department: str, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get devices by department"""
        return self.db.query(Device).filter(Device.department == department).offset(skip).limit(limit).all()
    
    def get_by_status(self, status: DeviceStatus, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get devices by status"""
        return self.db.query(Device).filter(Device.status == status).offset(skip).limit(limit).all()
    
    def update(self, device_id: int, device_data: DeviceUpdate) -> Optional[Device]:
        """Update device"""
        db_device = self.get_by_id(device_id)
        if not db_device:
            return None
        
        update_data = device_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_device, field, value)
        
        self.db.commit()
        self.db.refresh(db_device)
        return db_device
    
    def delete(self, device_id: int) -> bool:
        """Delete device"""
        db_device = self.get_by_id(device_id)
        if not db_device:
            return False
        
        self.db.delete(db_device)
        self.db.commit()
        return True
    
    def update_health_score(self, device_id: int, health_score: int) -> Optional[Device]:
        """Update device health score"""
        db_device = self.get_by_id(device_id)
        if not db_device:
            return None
        
        db_device.health_score = health_score
        self.db.commit()
        self.db.refresh(db_device)
        return db_device
    
    def get_out_of_service(self) -> List[Device]:
        """Get all out of service devices"""
        return self.db.query(Device).filter(Device.status == DeviceStatus.OUT_OF_SERVICE).all()
