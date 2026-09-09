import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.fault_reference_lookup_service import FaultReferenceLookupService


def test_reference_lookup_service_uses_rule_model():
    service = FaultReferenceLookupService()
    assert hasattr(service, "lookup")
    assert hasattr(service, "load_rules_from_json")
