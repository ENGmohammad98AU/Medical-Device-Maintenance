"""
BioMed AI Assistant - Main Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
import logging

from app.core.config import settings
from app.core.logging import setup_logging
from app.database.connection import engine, SessionLocal
from app.database.base import Base
from app.database.seed import (
    bootstrap_admin_user,
    seed_core_devices,
    seed_database,
    sync_postgres_device_type_enum,
)
from app.services.fault_reference_lookup_service import FaultReferenceLookupService

# Import models to register them with SQLAlchemy
# Import relationship targets before the Device model so the Device
# relationship string names can resolve without a mapper failure.
from app.models.user import User
from app.models.maintenance import MaintenanceRecord
from app.models.fault_report import FaultReport
from app.models.fault_resolution_workflow import FaultResolutionWorkflow
from app.models.device import Device
from app.models.fault_reference_rule import FaultReferenceRule
from app.models.audit_log import AuditLog
from app.models.analysis_event import DuplicateReportRecord, EvaluationEvent

# Import API routers
from app.api.auth import router as auth_router
from app.api.devices import router as devices_router
from app.api.fault_reports import router as fault_reports_router
from app.api.maintenance import router as maintenance_router
from app.api.dashboard import router as dashboard_router
from app.api.intelligent_support import router as intelligent_support_router

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting BioMed AI Assistant")
    # Create tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")

    # Supported reference devices are always initialized. Demo accounts remain
    # development-only; production can optionally bootstrap one admin from env.
    db = SessionLocal()
    try:
        enum_values_added = sync_postgres_device_type_enum(db)
        if enum_values_added:
            logger.info("PostgreSQL device type enum synchronized: %s added", enum_values_added)
        core_created = seed_core_devices(db)
        logger.info("Core device catalog synchronized: %s created", core_created)
        if bootstrap_admin_user(db):
            logger.info("Bootstrap administrator created from environment credentials")
    except Exception as exc:
        db.rollback()
        logger.exception("Core database initialization failed: %s", exc)
    finally:
        db.close()

    if settings.SEED_DEMO_DATA:
        try:
            seed_database()
        except Exception as exc:
            logger.warning(f"Demo database seed skipped or failed: {exc}")
    else:
        logger.info("Demo database seed disabled")

    # Keep the permanent manufacturer fault-reference table synchronized with
    # the version-controlled JSON source on every startup.
    reference_json = Path(__file__).resolve().parents[1] / "reference_data" / "medical_device_fault_reference.json"
    db = SessionLocal()
    try:
        imported = FaultReferenceLookupService(db).load_rules_from_json(str(reference_json))
        logger.info("Fault reference database synchronized: %s rules", imported)
    except Exception as exc:
        logger.exception("Fault reference import failed: %s", exc)
    finally:
        db.close()

    logger.info("Database initialization complete")
    yield
    logger.info("Shutting down BioMed AI Assistant")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Professional bilingual medical-device maintenance platform",
    lifespan=lifespan
)


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([
        *settings.ALLOWED_ORIGINS,
        settings.FRONTEND_URL,
    ])),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router)
app.include_router(devices_router)
app.include_router(fault_reports_router)
app.include_router(maintenance_router)
app.include_router(dashboard_router)
app.include_router(intelligent_support_router)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "ai_mode": settings.AI_MODE
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "BioMed AI Assistant API",
        "version": settings.APP_VERSION,
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
