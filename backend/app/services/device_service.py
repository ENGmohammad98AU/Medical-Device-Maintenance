"""
Device Service
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.device import Device, DeviceType, DeviceStatus
from app.schemas.device import DeviceCreate, DeviceUpdate
from app.repositories.device import DeviceRepository


class DeviceService:
    """Device service for business logic"""
    
    def __init__(self, db: Session):
        self.db = db
        self.repository = DeviceRepository(db)
    
    def create_device(self, device_data: DeviceCreate) -> Device:
        """Create a new device"""
        # Check if serial number already exists
        if self.repository.get_by_serial_number(device_data.serial_number):
            raise ValueError("Serial number already exists")
        
        return self.repository.create(device_data)
    
    def get_device(self, device_id: int) -> Optional[Device]:
        """Get device by ID"""
        return self.repository.get_by_id(device_id)
    
    def get_device_by_serial(self, serial_number: str) -> Optional[Device]:
        """Get device by serial number"""
        return self.repository.get_by_serial_number(serial_number)
    
    def get_all_devices(self, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get all devices"""
        return self.repository.get_all(skip, limit)
    
    def get_devices_by_type(self, device_type: DeviceType, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get devices by type"""
        return self.repository.get_by_type(device_type, skip, limit)
    
    def get_devices_by_department(self, department: str, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get devices by department"""
        return self.repository.get_by_department(department, skip, limit)
    
    def get_devices_by_status(self, status: DeviceStatus, skip: int = 0, limit: int = 100) -> List[Device]:
        """Get devices by status"""
        return self.repository.get_by_status(status, skip, limit)
    
    def update_device(self, device_id: int, device_data: DeviceUpdate) -> Optional[Device]:
        """Update device"""
        if device_data.serial_number:
            existing = self.repository.get_by_serial_number(device_data.serial_number)
            if existing and existing.id != device_id:
                raise ValueError("Serial number already exists")
        return self.repository.update(device_id, device_data)
    
    def delete_device(self, device_id: int) -> bool:
        """Delete device"""
        return self.repository.delete(device_id)
    
    def update_health_score(self, device_id: int, health_score: int) -> Optional[Device]:
        """Update device health score"""
        if health_score < 0 or health_score > 100:
            raise ValueError("Health score must be between 0 and 100")
        return self.repository.update_health_score(device_id, health_score)
    
    def get_out_of_service_devices(self) -> List[Device]:
        """Get all out of service devices"""
        return self.repository.get_out_of_service()
