"""
Devices API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database.connection import get_db
from app.api.dependencies import get_current_active_user, require_roles
from app.models.user import User, UserRole
from app.schemas.device import DeviceCreate, DeviceUpdate, Device
from app.services.device_service import DeviceService
from pydantic import BaseModel


router = APIRouter(prefix="/api/devices", tags=["Devices"])


@router.post("/", response_model=Device, status_code=status.HTTP_201_CREATED)
def create_device(
    device_data: DeviceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER))
):
    """Create a new device"""
    device_service = DeviceService(db)
    try:
        return device_service.create_device(device_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/")
def get_devices(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all devices"""
    device_service = DeviceService(db)
    devices = device_service.get_all_devices(skip, limit)
    return devices


@router.get("/{device_id}", response_model=Device)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get device by ID"""
    device_service = DeviceService(db)
    device = device_service.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.put("/{device_id}", response_model=Device)
def update_device(
    device_id: int,
    device_data: DeviceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER))
):
    """Update device"""
    device_service = DeviceService(db)
    device = device_service.update_device(device_id, device_data)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR))
):
    """Delete device"""
    device_service = DeviceService(db)
    if not device_service.delete_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
