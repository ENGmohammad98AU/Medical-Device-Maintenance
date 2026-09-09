from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.models.fault_reference_rule import FaultReferenceRule  # noqa: F401
from app.services.fault_reference_lookup_service import FaultReferenceLookupService


def make_service():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    service = FaultReferenceLookupService(session)
    reference_json = Path(__file__).resolve().parent / "reference_data" / "medical_device_fault_reference.json"
    imported = service.load_rules_from_json(str(reference_json))
    return service, session, imported


def test_reference_database_imports_all_rules():
    service, session, imported = make_service()
    try:
        assert imported == 39
        assert session.query(FaultReferenceRule).count() == 39
    finally:
        session.close()


def test_arabic_alias_matches_hamilton_c6():
    service, session, _ = make_service()
    try:
        result = service.lookup(
            device_query="Hamilton C6 Ventilator",
            fault_query="بطارية منخفضة",
            manufacturer="Hamilton Medical",
            model="C6",
        )
        assert result["matched"] is True
        assert result["matched_fault"] == "Battery low"
        assert "hamilton-medical.com" in result["reference_url"]
    finally:
        session.close()


def test_model_guard_prevents_cross_device_match():
    service, session, _ = make_service()
    try:
        result = service.lookup(
            device_query="Philips IntelliVue MX800",
            fault_query="Battery low",
            manufacturer="Philips",
            model="MX800",
        )
        assert result["matched"] is False
    finally:
        session.close()


def test_philips_arabic_alias_matches_mx800():
    service, session, _ = make_service()
    try:
        result = service.lookup(
            device_query="Philips MX800 Monitor",
            fault_query="انفصال أقطاب ECG",
            manufacturer="Philips",
            model="MX800",
        )
        assert result["matched"] is True
        assert result["matched_fault"] == "ECG Leads Off"
    finally:
        session.close()


def test_bbraun_alias_matches_perfusor_space():
    service, session, _ = make_service()
    try:
        result = service.lookup(
            device_query="Perfusor Space Pump",
            fault_query="occlusion detected",
            manufacturer="B. Braun",
            model="Perfusor Space",
        )
        assert result["matched"] is True
        assert result["matched_fault"] == "Pressure rise detect."
    finally:
        session.close()


def test_generic_single_word_does_not_select_specific_hamilton_rule():
    service, session, _ = make_service()
    try:
        for query in ("battery", "sensor", "alarm"):
            result = service.lookup(
                device_query="Hamilton C6 Ventilator",
                fault_query=query,
                manufacturer="Hamilton Medical",
                model="C6",
            )
            assert result["matched"] is False
            assert result["matched_fault"] == ""
    finally:
        session.close()
