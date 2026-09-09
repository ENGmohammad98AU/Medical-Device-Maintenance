"""
Maintenance API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database.connection import get_db
from app.api.dependencies import get_current_active_user, require_roles
from app.models.user import User, UserRole
from app.schemas.maintenance import MaintenanceRecordCreate, MaintenanceRecordUpdate, MaintenanceRecord
from app.services.maintenance_service import MaintenanceService


router = APIRouter(prefix="/api/maintenance", tags=["Maintenance"])


@router.post("/", response_model=MaintenanceRecord, status_code=status.HTTP_201_CREATED)
def create_maintenance_record(
    maintenance_data: MaintenanceRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER, UserRole.MEDICAL_TECHNICIAN))
):
    """Create a new maintenance record"""
    maintenance_service = MaintenanceService(db)
    return maintenance_service.create_maintenance_record(maintenance_data, current_user.id)


@router.get("/", response_model=List[MaintenanceRecord])
def get_maintenance_records(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all maintenance records"""
    maintenance_service = MaintenanceService(db)
    return maintenance_service.get_all_maintenance_records(skip, limit)


@router.get("/upcoming", response_model=List[MaintenanceRecord])
def get_upcoming_maintenance(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get upcoming maintenance in next N days"""
    maintenance_service = MaintenanceService(db)
    return maintenance_service.get_upcoming_maintenance(days)


@router.get("/overdue", response_model=List[MaintenanceRecord])
def get_overdue_maintenance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get overdue maintenance records"""
    maintenance_service = MaintenanceService(db)
    return maintenance_service.get_overdue_maintenance()


@router.get("/{maintenance_id}", response_model=MaintenanceRecord)
def get_maintenance_record(
    maintenance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get maintenance record by ID"""
    maintenance_service = MaintenanceService(db)
    record = maintenance_service.get_maintenance_record(maintenance_id)
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    return record


@router.get("/device/{device_id}", response_model=List[MaintenanceRecord])
def get_maintenance_records_by_device(
    device_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get maintenance records by device"""
    maintenance_service = MaintenanceService(db)
    return maintenance_service.get_maintenance_records_by_device(device_id, skip, limit)


@router.put("/{maintenance_id}", response_model=MaintenanceRecord)
def update_maintenance_record(
    maintenance_id: int,
    maintenance_data: MaintenanceRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER, UserRole.MEDICAL_TECHNICIAN))
):
    """Update maintenance record"""
    maintenance_service = MaintenanceService(db)
    record = maintenance_service.update_maintenance_record(maintenance_id, maintenance_data)
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    return record


@router.post("/{maintenance_id}/complete", response_model=MaintenanceRecord)
def complete_maintenance_record(
    maintenance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER, UserRole.MEDICAL_TECHNICIAN))
):
    """Complete maintenance record"""
    maintenance_service = MaintenanceService(db)
    record = maintenance_service.complete_maintenance_record(maintenance_id)
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    return record


@router.delete("/{maintenance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance_record(
    maintenance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER))
):
    """Delete maintenance record"""
    maintenance_service = MaintenanceService(db)
    if not maintenance_service.delete_maintenance_record(maintenance_id):
        raise HTTPException(status_code=404, detail="Maintenance record not found")
