from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.models.device import DeviceStatus, DeviceType
from app.models.fault_report import FaultReport
from app.models.maintenance import MaintenanceRecord
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceUpdate
from app.services.device_service import DeviceService


def device_payload(**overrides):
    payload = {
        "name": "Test Patient Monitor",
        "type": "patient_monitor",
        "manufacturer": "Test Manufacturer",
        "model": "Model 1",
        "serial_number": "TEST-001",
        "department": "ICU",
        "location": None,
        "purchase_date": None,
        "warranty_expiry": None,
        "notes": None,
        "status": "operational",
    }
    payload.update(overrides)
    return payload


def test_create_device_accepts_frontend_payload_with_empty_optional_values():
    device = DeviceCreate.model_validate(device_payload())

    assert device.type is DeviceType.PATIENT_MONITOR
    assert device.status is DeviceStatus.OPERATIONAL
    assert device.purchase_date is None
    assert device.warranty_expiry is None


def test_create_device_accepts_every_type_offered_by_frontend():
    expected_types = {
        "ventilator",
        "patient_monitor",
        "syringe_pump",
        "infusion_pump",
        "defibrillator",
        "ecg_machine",
        "ultrasound",
        "xray_machine",
        "mri_machine",
        "ct_scanner",
    }

    for value in expected_types:
        assert DeviceCreate.model_validate(device_payload(type=value)).type.value == value


def test_update_device_accepts_all_editable_fields():
    update = DeviceUpdate.model_validate({
        "name": "Updated Device",
        "type": "ultrasound",
        "manufacturer": "Updated Manufacturer",
        "model": "U1",
        "serial_number": "UPDATED-001",
        "department": "Radiology",
        "status": "under_maintenance",
        "location": "Room 3",
        "purchase_date": "2026-01-02T00:00:00",
        "warranty_expiry": None,
        "notes": "Updated",
    })

    assert update.type is DeviceType.ULTRASOUND
    assert update.status is DeviceStatus.UNDER_MAINTENANCE
    assert update.purchase_date == datetime(2026, 1, 2)


def test_device_service_creates_and_updates_frontend_payload():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    service = DeviceService(db)

    created = service.create_device(DeviceCreate.model_validate(device_payload()))
    assert created.id is not None
    assert created.type is DeviceType.PATIENT_MONITOR
    assert created.status is DeviceStatus.OPERATIONAL

    updated = service.update_device(created.id, DeviceUpdate.model_validate({
        "type": "ultrasound",
        "status": "under_maintenance",
        "purchase_date": "2026-01-02T00:00:00",
    }))
    assert updated is not None
    assert updated.type is DeviceType.ULTRASOUND
    assert updated.status is DeviceStatus.UNDER_MAINTENANCE
    assert updated.purchase_date == datetime(2026, 1, 2)

    db.close()
