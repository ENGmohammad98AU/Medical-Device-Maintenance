from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.models.user import User
from app.models.device import Device, DeviceType, DeviceStatus
from app.models.fault_report import FaultReport
from app.models.maintenance import MaintenanceRecord
from app.models.fault_reference_rule import FaultReferenceRule
from app.models.audit_log import AuditLog
from app.models.analysis_event import DuplicateReportRecord, EvaluationEvent
from app.services.audit_trail_service import AuditTrailService
from app.services.duplicate_detection_service import DuplicateDetectionService
from app.services.evaluation_service import EvaluationService
from app.services.data_cleaning_service import DataCleaningService
from app.services.nlp_entity_extractor import NLPEntityExtractor
from app.services.fault_reference_lookup_service import FaultReferenceLookupService
from app.ai.pipeline.ai_service import AIService


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_persistent_audit_decision():
    db = make_db()
    service = AuditTrailService(db)
    log = service.create_log_entry(
        "1", "biomedical_engineer", "FAULT_ANALYSIS", "input", "input", {}, {},
        [], [], ["manual"], "response", 0.9, {}, 12.0, True,
    )
    service.add_engineer_decision(log.id, "APPROVED", "verified")
    assert AuditTrailService(db).get_log_entry(log.id).review_status == "REVIEWED"


def test_duplicate_and_evaluation_survive_service_recreation():
    db = make_db()
    duplicate = DuplicateDetectionService(db)
    payload = {
        "device_type": "VENTILATOR", "error_message": "oxygen supply failed",
        "error_code": "O2", "department": "ICU", "model": "C6",
        "fault_type": "HIGH", "device_id": "1",
    }
    duplicate.add_report("R1", payload)
    assert DuplicateDetectionService(db).check_duplicate(payload) is not None

    evaluation = EvaluationService(db)
    evaluation.add_response_time(100)
    evaluation.add_labeled_report("R1", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH")
    reloaded = EvaluationService(db)
    assert reloaded.response_times == [100.0]
    assert len(reloaded.labeled_reports) == 1


def test_cleaning_preserves_identifiers_and_nlp_recognizes_supported_devices():
    cleaned = DataCleaningService().clean_data("Hamilton C6 Error E123")
    assert "C6" in cleaned.cleaned_text
    assert "E123" in cleaned.cleaned_text
    entities = NLPEntityExtractor().extract_structured_data("Hamilton Medical C6 ventilator")
    assert entities["manufacturer"] == "Hamilton Medical"
    assert entities["model"] == "C6"


def test_seed_database_runs_without_model_relationship_resolve_error():
    from app.database.seed import seed_database

    seed_database()


def test_legacy_analysis_uses_reference_database():
    db = make_db()
    device = Device(
        name="Hamilton C6 Ventilator", type=DeviceType.VENTILATOR,
        manufacturer="Hamilton Medical", model="C6", serial_number="TEST-C6",
        department="ICU", status=DeviceStatus.OPERATIONAL,
    )
    db.add(device); db.commit(); db.refresh(device)
    assert FaultReferenceLookupService(db).load_rules_from_json("reference_data/medical_device_fault_reference.json") == 39
    rule = db.query(FaultReferenceRule).filter(FaultReferenceRule.model == "C6").first()
    fault = rule.error_message or rule.alarm_code or rule.fault_code or rule.description
    result = AIService(db).analyze_fault(device.id, fault, rule.description or fault)
    assert result.references
    assert result.is_demo is False
