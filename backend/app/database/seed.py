"""Database initialization helpers.

Core reference devices are safe to create in every environment. Demo users are
strictly opt-in for local development. A production bootstrap administrator can
be created only from explicit environment credentials.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database.connection import SessionLocal
from app.models.user import User, UserRole
from app.models.maintenance import MaintenanceRecord
from app.models.fault_report import FaultReport
from app.models.device import Device, DeviceType, DeviceStatus
from app.security.password import get_password_hash
from app.core.config import settings


CORE_DEVICES = [
    dict(
        name="Hamilton C6 Ventilator",
        type=DeviceType.VENTILATOR,
        manufacturer="Hamilton Medical",
        model="C6",
        serial_number="CATALOG-HAMILTON-C6",
        department="Biomedical Engineering",
        status=DeviceStatus.OPERATIONAL,
        location="Reference catalog",
        health_score=100,
        notes="Reference catalog entry; replace serial/location with the physical asset when applicable.",
    ),
    dict(
        name="Philips IntelliVue MX800 Monitor",
        type=DeviceType.PATIENT_MONITOR,
        manufacturer="Philips",
        model="MX800",
        serial_number="CATALOG-PHILIPS-MX800",
        department="Biomedical Engineering",
        status=DeviceStatus.OPERATIONAL,
        location="Reference catalog",
        health_score=100,
        notes="Reference catalog entry; replace serial/location with the physical asset when applicable.",
    ),
    dict(
        name="B. Braun Perfusor Space",
        type=DeviceType.SYRINGE_PUMP,
        manufacturer="B. Braun",
        model="Perfusor Space",
        serial_number="CATALOG-BBRAUN-PERFUSOR-SPACE",
        department="Biomedical Engineering",
        status=DeviceStatus.OPERATIONAL,
        location="Reference catalog",
        health_score=100,
        notes="Reference catalog entry; replace serial/location with the physical asset when applicable.",
    ),
]


DEMO_USERS = [
    ("admin@biomed.ai", "admin", "admin123", "System Administrator", UserRole.ADMINISTRATOR),
    ("engineer@biomed.ai", "engineer", "engineer123", "Biomedical Engineer", UserRole.BIOMEDICAL_ENGINEER),
    ("technician@biomed.ai", "technician", "technician123", "Medical Technician", UserRole.MEDICAL_TECHNICIAN),
    ("doctor@biomed.ai", "doctor", "doctor123", "Doctor", UserRole.DOCTOR),
    ("nurse@biomed.ai", "nurse", "nurse123", "Nurse", UserRole.NURSE),
]


def sync_postgres_device_type_enum(db: Session) -> int:
    """Add newly supported device types to an existing PostgreSQL enum."""
    if db.bind is None or db.bind.dialect.name != "postgresql":
        return 0

    enum_exists = db.execute(text(
        "SELECT 1 FROM pg_type WHERE typname = 'devicetype'"
    )).scalar()
    if not enum_exists:
        return 0

    existing = set(db.execute(text(
        """
        SELECT enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        WHERE pg_type.typname = 'devicetype'
        """
    )).scalars())

    added = 0
    for device_type in DeviceType:
        # SQLAlchemy persists Python enum member names for native PostgreSQL enums.
        label = device_type.name
        if label not in existing:
            db.execute(text(f"ALTER TYPE devicetype ADD VALUE IF NOT EXISTS '{label}'"))
            added += 1
    db.commit()
    return added


def seed_core_devices(db: Session) -> int:
    """Create the three supported device catalog entries if they do not exist."""
    created = 0
    for data in CORE_DEVICES:
        exists = db.query(Device).filter(Device.serial_number == data["serial_number"]).first()
        if not exists:
            db.add(Device(**data))
            created += 1
    if created:
        db.commit()
    return created


def seed_demo_users(db: Session) -> int:
    """Create or synchronize the five fixed demo users."""
    synchronized = 0

    for email, username, password, full_name, role in DEMO_USERS:
        user = db.query(User).filter(User.username == username).first()

        if user is None:
            user = db.query(User).filter(User.email == email).first()

        department = (
            "Biomedical Engineering"
            if role in {
                UserRole.BIOMEDICAL_ENGINEER,
                UserRole.MEDICAL_TECHNICIAN,
            }
            else None
        )

        if user is None:
            user = User(
                email=email,
                username=username,
                hashed_password=get_password_hash(password),
                full_name=full_name,
                role=role,
                is_active=True,
                department=department,
            )
            db.add(user)
        else:
            user.email = email
            user.username = username
            user.hashed_password = get_password_hash(password)
            user.full_name = full_name
            user.role = role
            user.is_active = True
            user.department = department

        synchronized += 1

    db.commit()
    return synchronized


def bootstrap_admin_user(db: Session) -> bool:
    """Create a first production administrator only from explicit env credentials."""
    username = (settings.BOOTSTRAP_ADMIN_USERNAME or "").strip()
    password = settings.BOOTSTRAP_ADMIN_PASSWORD or ""
    email = (settings.BOOTSTRAP_ADMIN_EMAIL or "").strip()
    if not username or not password or not email:
        return False

    existing_admin = db.query(User).filter(User.role == UserRole.ADMINISTRATOR).first()
    if existing_admin:
        return False
    if db.query(User).filter((User.username == username) | (User.email == email)).first():
        return False

    db.add(User(
        email=email,
        username=username,
        hashed_password=get_password_hash(password),
        full_name="System Administrator",
        role=UserRole.ADMINISTRATOR,
        is_active=True,
        department="Biomedical Engineering",
    ))
    db.commit()
    return True


def seed_database():
    """Local development seed: core devices plus demo users."""
    db = SessionLocal()
    try:
        devices = seed_core_devices(db)
        users = seed_demo_users(db)
        print(f"Database seed complete: {devices} core devices, {users} demo users created")
    except Exception as exc:
        db.rollback()
        print(f"Error seeding database: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
