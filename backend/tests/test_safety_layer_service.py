from types import SimpleNamespace

from app.services.fault_classification_service import (
    FaultClassificationService,
    SeverityLevel,
)
from app.services.safety_layer_service import (
    RecommendationType,
    SafetyCheck,
    SafetyLayerService,
    SafetyLevel,
)


def _safety_check(requires_specialist: bool = False) -> SafetyCheck:
    return SafetyCheck(
        is_safe=True,
        safety_level=SafetyLevel.WARNING if requires_specialist else SafetyLevel.SAFE,
        recommendation_type=RecommendationType.TECHNICAL,
        warning_message=None,
        requires_clinical_approval=False,
        requires_specialist_escalation=requires_specialist,
        allowed_actions=[],
        prohibited_actions=[],
    )


def test_emergency_priority_is_not_downgraded_by_specialist_requirement():
    service = SafetyLayerService()
    classification = SimpleNamespace(
        is_emergency=True,
        requires_specialist=True,
        severity=SeverityLevel.CRITICAL,
    )

    result = service.enforce_escalation_for_critical(
        classification,
        _safety_check(requires_specialist=True),
    )

    assert result["escalation_required"] is True
    assert result["escalation_level"] == "EMERGENCY"
    assert "Emergency protocol activation" in result["required_actions"]
    assert "Specialist consultation required" in result["required_actions"]


def test_specialist_escalation_when_case_is_not_emergency():
    service = SafetyLayerService()
    classification = SimpleNamespace(
        is_emergency=False,
        requires_specialist=True,
        severity=SeverityLevel.HIGH,
    )

    result = service.enforce_escalation_for_critical(
        classification,
        _safety_check(requires_specialist=False),
    )

    assert result["escalation_required"] is True
    assert result["escalation_level"] == "SPECIALIST"


def test_no_escalation_for_low_risk_case_without_specialist_requirement():
    service = SafetyLayerService()
    classification = SimpleNamespace(
        is_emergency=False,
        requires_specialist=False,
        severity=SeverityLevel.LOW,
    )

    result = service.enforce_escalation_for_critical(
        classification,
        _safety_check(requires_specialist=False),
    )

    assert result["escalation_required"] is False
    assert result["escalation_level"] is None


def test_patient_connected_hamilton_emergency_remains_emergency():
    classifier = FaultClassificationService()
    safety = SafetyLayerService()

    classification = classifier.classify_fault(
        device_type="VENTILATOR",
        error_message="Battery low",
        customer_expertise="INTERMEDIATE",
        device_location=None,
        patient_connected=True,
    )
    safety_check = safety.check_recommendation_safety(
        recommendation=classification.recommended_action,
        user_role="biomedical_engineer",
        device_type="VENTILATOR",
        patient_connected=True,
    )
    result = safety.enforce_escalation_for_critical(classification, safety_check)

    assert classification.is_emergency is True
    assert classification.requires_specialist is True
    assert result["escalation_required"] is True
    assert result["escalation_level"] == "EMERGENCY"


def test_filter_clinical_advice_accepts_lowercase_clinical_roles():
    service = SafetyLayerService()
    content = "Treatment guidance for clinical staff"

    assert service.filter_clinical_advice(content, "doctor") == content
    assert service.filter_clinical_advice(content, "nurse") == content
    assert service.filter_clinical_advice(content, "DOCTOR") == content
    assert service.filter_clinical_advice(content, "NURSE") == content


def test_filter_clinical_advice_blocks_nonclinical_role():
    service = SafetyLayerService()
    content = "Treatment guidance for clinical staff"

    result = service.filter_clinical_advice(content, "biomedical_engineer")

    assert result == "[CLINICAL ADVICE REMOVED - Contact clinical staff for this information]"
