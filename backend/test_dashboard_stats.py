from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.models.user import User  # noqa: F401
from app.models.device import Device  # noqa: F401
from app.models.fault_report import FaultReport  # noqa: F401
from app.models.maintenance import MaintenanceRecord  # noqa: F401
from app.models.audit_log import AuditLog
from app.models.fault_reference_rule import FaultReferenceRule  # noqa: F401
from app.models.analysis_event import DuplicateReportRecord, EvaluationEvent  # noqa: F401
from app.api.dashboard import get_dashboard_stats


def make_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def add_audit(db, log_id: str, confidence: float, action: str = "FAULT_ANALYSIS"):
    db.add(AuditLog(
        id=log_id,
        user_id="1",
        user_role="biomedical_engineer",
        action=action,
        original_input="fault report",
        cleaned_input="fault report",
        confidence_score=confidence,
    ))


def test_dashboard_uses_successful_maintenance_analysis_confidence():
    db = make_db()
    try:
        add_audit(db, "MATCH-1", 0.919)
        add_audit(db, "MATCH-2", 0.620)
        add_audit(db, "NO-MATCH", 0.0)
        add_audit(db, "OTHER-ACTION", 1.0, action="OTHER")
        db.commit()

        stats = get_dashboard_stats(db=db, current_user=None)

        assert stats["ai_confidence"] == 76.95
    finally:
        db.close()


def test_dashboard_confidence_is_zero_without_successful_analyses():
    db = make_db()
    try:
        add_audit(db, "NO-MATCH", 0.0)
        db.commit()

        stats = get_dashboard_stats(db=db, current_user=None)

        assert stats["ai_confidence"] == 0
    finally:
        db.close()
