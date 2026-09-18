from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.models.audit_log import AuditLog
from app.models.user import UserRole
from app.services.audit_trail_service import AuditTrailService
from app.api.intelligent_support import add_engineer_decision as api_add_engineer_decision


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    AuditLog.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _create_log(service: AuditTrailService, *, requires_review: bool = True):
    return service.create_log_entry(
        user_id="1",
        user_role="biomedical_engineer",
        action="ANALYZE_FAULT",
        original_input="Hamilton C6 Battery low",
        cleaned_input="Hamilton C6 Battery low",
        extracted_entities={"device": ["Hamilton C6"]},
        classification_result={"severity": "HIGH"},
        retrieved_chunks=["Battery low"],
        retrieval_scores=[1.0],
        sources=["Hamilton C6 Operator's Manual"],
        generated_response="Battery low reference response",
        confidence_score=1.0,
        safety_check_result={"safety_level": "SAFE"},
        processing_time_ms=125.0,
        requires_review=requires_review,
    )


def test_create_audit_log_persists_required_fields(db):
    service = AuditTrailService(db)

    entry = _create_log(service)

    assert entry.id.startswith("AUDIT_")
    assert entry.user_id == "1"
    assert entry.user_role == "biomedical_engineer"
    assert entry.classification_result["severity"] == "HIGH"
    assert entry.sources == ["Hamilton C6 Operator's Manual"]
    assert entry.confidence_score == 1.0
    assert entry.processing_time_ms == 125.0
    assert entry.review_status == "PENDING"


def test_pending_review_is_returned(db):
    service = AuditTrailService(db)
    entry = _create_log(service, requires_review=True)
    _create_log(service, requires_review=False)

    pending = service.get_pending_reviews()

    assert [item.id for item in pending] == [entry.id]


@pytest.mark.parametrize("decision", ["APPROVED", "MODIFIED", "ESCALATED", "REJECTED"])
def test_engineer_decision_moves_log_to_reviewed(db, decision):
    service = AuditTrailService(db)
    entry = _create_log(service)

    updated = service.add_engineer_decision(
        entry.id,
        decision,
        "Reviewed by biomedical engineer",
    )

    assert updated is not None
    assert updated.engineer_decision == decision
    assert updated.engineer_comments == "Reviewed by biomedical engineer"
    assert updated.decision_timestamp is not None
    assert updated.review_status == "REVIEWED"


def test_audit_statistics_reflect_pending_autoapproved_and_reviewed(db):
    service = AuditTrailService(db)
    pending = _create_log(service, requires_review=True)
    _create_log(service, requires_review=False)
    service.add_engineer_decision(pending.id, "APPROVED", "ok")

    stats = service.get_statistics()

    assert stats["total_logs"] == 2
    assert stats["pending_reviews"] == 0
    assert stats["auto_approved"] == 1
    assert stats["reviewed"] == 1


def test_api_rejects_decision_from_unauthorized_role(db):
    service = AuditTrailService(db)
    entry = _create_log(service)
    current_user = SimpleNamespace(role=UserRole.MEDICAL_TECHNICIAN)

    with pytest.raises(HTTPException) as exc_info:
        api_add_engineer_decision(
            log_id=entry.id,
            decision="APPROVED",
            comments="not allowed",
            db=db,
            current_user=current_user,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.parametrize("role", [UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER])
def test_api_allows_decision_for_authorized_roles(db, role):
    service = AuditTrailService(db)
    entry = _create_log(service)
    current_user = SimpleNamespace(role=role)

    response = api_add_engineer_decision(
        log_id=entry.id,
        decision="APPROVED",
        comments="approved",
        db=db,
        current_user=current_user,
    )

    assert response["message"] == "Decision added successfully"
    assert response["decision"] == "APPROVED"
    refreshed = service.get_log_entry(entry.id)
    assert refreshed.review_status == "REVIEWED"
