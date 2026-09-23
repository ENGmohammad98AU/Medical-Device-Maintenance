"""
Intelligent Support API
Integrates fault classification, NLP entity extraction, knowledge base, and safety layer
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path
import re
import logging
from app.database.connection import get_db
from app.api.dependencies import get_current_active_user
from app.models.user import User, UserRole
from app.models.device import Device
from app.models.fault_report import FaultReport
from app.services.fault_classification_service import (
    FaultClassificationService,
    SeverityLevel,
    ImportanceLevel,
    FaultLevel
)
from app.services.nlp_entity_extractor import NLPEntityExtractor
from app.services.knowledge_base_service import KnowledgeBaseService
from app.services.safety_layer_service import SafetyLayerService
from app.services.data_cleaning_service import DataCleaningService
from app.services.rag_service import RAGService
from app.services.duplicate_detection_service import DuplicateDetectionService
from app.services.audit_trail_service import AuditTrailService
from app.services.evaluation_service import EvaluationService
from app.services.fault_reference_lookup_service import FaultReferenceLookupService, NO_MATCH
from app.services.llm_triage_service import LLMTriageService, LLMRun, apply_triage, redact_report
from app.services.browser_llm_service import BrowserLLMResult, browser_run
from app.services.customer_support_service import prepare_support, resolve_support
from app.services.fault_resolution_workflow_service import FaultResolutionWorkflowService


router = APIRouter(prefix="/api/intelligent-support", tags=["Intelligent Support"])
logger = logging.getLogger(__name__)

# Initialize services
classification_service = FaultClassificationService()
nlp_service = NLPEntityExtractor()
knowledge_service = KnowledgeBaseService()
safety_service = SafetyLayerService()
data_cleaning_service = DataCleaningService()
rag_service = RAGService()
llm_service = LLMTriageService()


class FaultAnalysisRequest(BaseModel):
    """Request for intelligent fault analysis"""
    device_id: int = Field(..., description="Database device identifier")
    report_id: Optional[int] = Field(default=None, description="Fault report identifier for end-to-end tracking")
    device_name: Optional[str] = Field(None, description="Displayed device name")
    manufacturer: Optional[str] = Field(None, description="Displayed manufacturer")
    model: Optional[str] = Field(None, description="Displayed device model")
    fault: str = Field(default="", max_length=200, description="Fault or error code")
    description: str = Field(..., min_length=10, max_length=4000, description="Technical fault description without patient identifiers")
    customer_expertise: str = Field(default="INTERMEDIATE", description="Customer expertise level")
    device_location: Optional[str] = Field(None, description="Location of device")
    patient_connected: bool = Field(default=False, description="Whether patient is connected")
    browser_llm: Optional[BrowserLLMResult] = None

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("customer_expertise")
    @classmethod
    def validate_customer_expertise(cls, value: str) -> str:
        normalized = value.strip().upper()
        aliases = {"BASIC": "NOVICE"}
        normalized = aliases.get(normalized, normalized)
        allowed = {"NOVICE", "INTERMEDIATE", "ADVANCED", "EXPERT"}
        if normalized not in allowed:
            raise ValueError(f"customer_expertise must be one of: {', '.join(sorted(allowed))}")
        return normalized


class FaultAnalysisResponse(BaseModel):
    """Response from intelligent fault analysis"""

    # Primary reference lookup results
    device: str = ""
    matched_fault: str = ""
    meaning: str = ""
    possible_causes: str = ""
    immediate_safety_action: str = ""
    recommended_solution: str = ""
    verification_before_return_to_service: str = ""
    source: str = ""
    reference_url: str = ""
    reference_page: str = ""
    match_confidence: float = 0.0
    match_status: str = "NO_MATCH"

    # Data cleaning results
    cleaned_text: str
    removed_patient_data: List[str]
    detected_language: str

    # Duplicate detection
    is_duplicate: bool
    duplicate_report_id: Optional[str]
    duplicate_similarity_score: Optional[float]

    # Classification results
    severity: str
    importance: str
    fault_level: str
    is_emergency: bool
    requires_specialist: bool
    safety_impact: str

    # NLP extracted entities
    extracted_entities: Dict[str, Any]

    # Knowledge base results
    troubleshooting_steps: List[str]
    safety_precautions: List[str]
    error_code_meaning: Optional[str]
    calibration_procedures: List[str]

    # RAG results
    rag_response: str
    rag_sources: List[str]
    rag_confidence: float
    reference_found: bool

    # Safety check results
    safety_level: str
    recommendation_type: str
    warning_message: Optional[str]
    requires_clinical_approval: bool
    allowed_actions: List[str]
    prohibited_actions: List[str]

    # Escalation information
    escalation_required: bool
    escalation_level: Optional[str]
    escalation_actions: List[str]
    mandatory_procedures: List[str]

    # Recommendations
    recommended_action: str
    estimated_resolution_time: str

    # Metadata
    confidence_score: float
    sources: List[str]
    audit_log_id: str
    classification_source: str = "RULES"
    fault_category: Optional[str] = None
    routing_target: str = "BIOMEDICAL_ENGINEERING"
    routing_is_proposal: bool = True
    safety_guards: List[str] = Field(default_factory=list)
    llm: LLMRun = Field(default_factory=lambda: LLMRun(status="disabled"))
    customer_support: Dict[str, Any] = Field(default_factory=dict)
    workflow: Optional[Dict[str, Any]] = None


FAULT_INDICATORS = {
    'fault', 'failure', 'failed', 'malfunction', 'error', 'alarm', 'warning', 'leak',
    'pressure', 'sensor', 'power', 'battery', 'oxygen', 'display', 'screen', 'cable',
    'connection', 'disconnected', 'stopped', 'broken', 'noise', 'sound', 'slow',
    'problem', 'issue', 'not', 'cannot', "doesn't", 'calibration', 'temperature',
    'عطل', 'خطأ', 'إنذار', 'تحذير', 'تسريب', 'ضغط', 'حساس', 'طاقة', 'بطارية',
    'أكسجين', 'شاشة', 'توقف', 'مشكلة', 'لا', 'يعمل', 'حرارة',
}


def _is_meaningful_fault(text: str) -> bool:
    """Reject keyboard noise and greetings before any analysis work starts."""
    normalized = text.strip().lower()
    if len(normalized) < 3 or re.fullmatch(r'[\W_\d]+', normalized):
        return False
    if len(set(normalized.replace(' ', ''))) == 1:
        return False
    if re.fullmatch(r'(?:[a-z]){3,}', normalized) and normalized not in FAULT_INDICATORS:
        return False
    if re.search(r'\b(?:e|err|error)[- _]?\d{1,5}\b', normalized, re.IGNORECASE):
        return True
    tokens = set(re.findall(r'[\w\u0600-\u06ff]+', normalized))
    return bool(tokens.intersection(FAULT_INDICATORS))


NO_REFERENCE_MESSAGE = "لا توجد حالياً معلومات مرجعية كافية لتشخيص هذا العطل. يرجى إضافة المرجع الفني الخاص بالجهاز."


@router.post("/prepare-support")
def prepare_customer_support(
    request: FaultAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Read-only preparation; no model credentials, audit writes or cloud calls."""
    device = db.query(Device).filter(Device.id == request.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    context, _ = prepare_support(request, device, db)
    return context


@router.post("/analyze-fault", response_model=FaultAnalysisResponse)
def analyze_fault(
    request: FaultAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Analyze a fault using intelligent classification, NLP, knowledge base, and safety layer
    
    This endpoint provides comprehensive fault analysis including:
    - Data cleaning (removes patient data, corrects spelling, standardizes terminology)
    - Automatic classification based on severity, importance, and fault level
    - NLP entity extraction (device, error codes, department, etc.)
    - Knowledge base lookup (troubleshooting steps, safety precautions)
    - Local LLM scope assessment and selection among sourced references
    - Reference text with source attribution (no generated repair instructions)
    - Safety layer enforcement (prevents unauthorized clinical advice)
    - Escalation path determination
    """
    fault_text = (request.fault or "").strip()
    description_text = (request.description or "").strip()
    if not description_text:
        logger.info("maintenance_validation device_id=%s validation=invalid", request.device_id)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="يرجى إدخال وصف العطل")

    if fault_text and not _is_meaningful_fault(fault_text):
        logger.info("maintenance_validation device_id=%s validation=invalid", request.device_id)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="يرجى إدخال العطل")

    device = db.query(Device).filter(Device.id == request.device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if request.report_id is not None:
        report = db.query(FaultReport).filter(FaultReport.id == request.report_id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fault report not found")
        if report.device_id != device.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fault report does not belong to the selected device")

    device_type = device.type.value.upper().replace('-', '_').replace(' ', '_')
    device_name = device.name
    manufacturer = device.manufacturer
    model = device.model
    description = request.description.strip()
    fault = fault_text
    logger.info("maintenance_validation device_id=%s validation=valid", device.id)

    # Step 0: Look up the imported fault-reference workbook data in the project SQLite
    # fallback/local database rather than relying on demo or hard-coded sample text.
    reference_lookup = FaultReferenceLookupService(db).lookup(
        device_query=device_name,
        fault_query=fault,
        description=description,
        manufacturer=manufacturer,
        model=model,
    )

    try:
        import time
        start_time = time.time()
        duplicate_detection_service = DuplicateDetectionService(db)
        evaluation_service = EvaluationService(db)
        
        # Step 0: Clean data
        full_text = f"{device_name} {fault} {description} {model} {manufacturer}"
        cleaned_data = data_cleaning_service.clean_data(redact_report(full_text))
        
        # Step 0.5: Check for duplicates
        report_data = {
            'device_type': device_type,
            'error_message': fault,
            'error_code': fault,
            'department': request.device_location,
            'model': model
        }
        duplicate_check = duplicate_detection_service.check_duplicate(report_data)
        
        # Step 1: Classify the fault
        rule_classification = classification_service.classify_fault(
            device_type=device_type,
            error_message=f"{fault} {description}",
            customer_expertise=request.customer_expertise,
            device_location=request.device_location,
            patient_connected=request.patient_connected
        )

        # The external model receives a minimal, redacted technical report, never
        # user identity, device serial number, location, or database credentials.
        if request.browser_llm is not None:
            # Local success, failure and disablement never fall back to a cloud API.
            llm_run = browser_run(
                request.browser_llm, report_text=f"{fault} {description}".strip(),
                device_type=device_type, patient_connected=request.patient_connected,
            )
        else:
            llm_run = llm_service.classify(
                report_text=f"{fault} {description}".strip(), device_type=device_type,
                manufacturer=manufacturer, model=model,
                patient_connected=request.patient_connected, reference=reference_lookup,
            )
        # Recompute candidates from authoritative device/source records. Model
        # abstention suppresses all repair retrieval, including the legacy path.
        baseline_reference_severity = reference_lookup.get("severity") if reference_lookup.get("matched") else None
        support_context, support_references = prepare_support(request, device, db)
        fallback_reference = (support_references[0] if support_references else dict(NO_MATCH)) if request.browser_llm else reference_lookup
        reference_lookup, support_result, restrict_retrieval = resolve_support(
            support_context, support_references,
            request.browser_llm.support if request.browser_llm else None,
            llm_run, fallback_reference,
        )
        # Local processing uses the same device/source boundaries during outages.
        # A fallback must not reintroduce an excluded or unsourced repair.
        restrict_retrieval = restrict_retrieval or request.browser_llm is not None
        classification, classification_source, routing_target, safety_guards = apply_triage(
            rule_classification, llm_run,
            baseline_reference_severity,
        )
        # Selection/abstention cannot lower the severity of the original match.
        classification, _, _, selected_guards = apply_triage(
            classification, llm_run, reference_lookup.get("severity") if reference_lookup.get("matched") else None,
        )
        safety_guards = list(dict.fromkeys(safety_guards + selected_guards))
        if classification.is_emergency:
            support_result["guards"].append("EMERGENCY_PRIORITY")
            support_result["message"] = "تستدعي الحالة مراجعة عاجلة وفق قواعد السلامة؛ اتبع إجراءات المنشأة ولا تنتظر اكتمال الدعم الآلي. " + support_result["message"]
        if not classification.is_emergency and support_result["status"] in {"NEEDS_DETAILS", "NO_REFERENCE", "OUT_OF_SCOPE", "INVALID_RESULT"}:
            routing_target = "REQUEST_CLARIFICATION" if support_result["status"] != "NO_REFERENCE" else "BIOMEDICAL_ENGINEERING"
            classification.recommended_action = support_result["message"]
        
        # Step 2: Extract entities using NLP
        extracted_entities = nlp_service.extract_structured_data(cleaned_data.cleaned_text)
        
        # Convert to response format
        entities_response = {}
        for entity_type, value in extracted_entities.items():
            if entity_type == 'confidence_scores':
                entities_response[entity_type] = value
            elif isinstance(value, list):
                entities_response[entity_type] = [{'value': v, 'confidence': 0.8} for v in value]
            else:
                entities_response[entity_type] = [{'value': value, 'confidence': 0.8}] if value else []
        
        # Step 3: Get knowledge base information
        # Only authoritative RAG documents may populate reference fields.
        troubleshooting_steps = []
        safety_precautions = []
        error_code_meaning = None
        calibration_procedures = []
        
        # Step 4: Safety check
        safety_check = safety_service.check_recommendation_safety(
            recommendation=classification.recommended_action,
            user_role=current_user.role.value,
            device_type=device_type,
            patient_connected=request.patient_connected
        )
        
        # Step 5: Generate RAG response
        rag_query = f"{device_name} {fault} {description}"
        rag_result = {"response": "", "sources": [], "confidence": 0.0, "retrieved_context": [], "requires_review": True} if restrict_retrieval else rag_service.rag_pipeline(
            rag_query,
            current_user.role.value,
            device_type=device_type,
            manufacturer=manufacturer,
            model=model,
        )
        db_reference_found = bool(reference_lookup.get("matched"))
        rag_reference_found = bool(rag_result['sources'] and rag_result['retrieved_context'])
        reference_found = db_reference_found or rag_reference_found

        # The verified manufacturer rule database is the primary diagnostic source.
        # RAG is only a secondary source and must never override an exact verified rule.
        if db_reference_found:
            troubleshooting_steps = reference_lookup.get("troubleshooting_steps") or []
            immediate_safety_action = reference_lookup.get("immediate_safety_action", "").strip()
            safety_precautions = [immediate_safety_action] if immediate_safety_action else []
            error_code_meaning = reference_lookup.get("meaning") or None

            source_label = reference_lookup.get("source", "").strip()
            reference_page = reference_lookup.get("reference_page", "").strip()
            if source_label and reference_page:
                source_label = f"{source_label} — page {reference_page}"

            response_parts = [
                reference_lookup.get("meaning", "").strip(),
                reference_lookup.get("recommended_solution", "").strip(),
                reference_lookup.get("verification_before_return_to_service", "").strip(),
            ]
            rag_result['response'] = "\n\n".join(part for part in response_parts if part) or NO_REFERENCE_MESSAGE
            rag_result['sources'] = [source_label] if source_label else []
            rag_result['confidence'] = float(reference_lookup.get("match_confidence") or 0.0)
            rag_result['retrieved_context'] = [
                value for value in (
                    reference_lookup.get("meaning", ""),
                    reference_lookup.get("possible_causes", ""),
                    reference_lookup.get("recommended_solution", ""),
                ) if value
            ]
            rag_result['requires_review'] = True
        elif not rag_reference_found:
            rag_result['response'] = support_result["message"] if restrict_retrieval else NO_REFERENCE_MESSAGE

        # LLM outcomes, refusals and outages all remain reviewable, even without
        # a matching manual. No model output populates technical repair fields.
        if llm_run.status != "disabled":
            rag_result['requires_review'] = True

        logger.info(
            "maintenance_reference device_id=%s model=%s db_reference_found=%s rag_reference_found=%s "
            "reference_found=%s sources=%s final_response_type=%s",
            device.id, model, db_reference_found, rag_reference_found, reference_found,
            rag_result['sources'], 'reference_context' if reference_found else 'no_reference'
        )
        
        # Step 6: Determine escalation
        escalation_decision = safety_service.enforce_escalation_for_critical(classification, safety_check)
        
        # Step 7: Filter content based on safety
        filtered_steps = [
            safety_service.filter_clinical_advice(step, current_user.role.value)
            for step in troubleshooting_steps
        ]
        
        # Calculate overall confidence
        confidence_scores = extracted_entities.get('confidence_scores', {})
        avg_confidence = sum(confidence_scores.values()) / len(confidence_scores) if confidence_scores else 0.75
        
        # Compile sources
        sources = []
        if reference_found:
            sources.extend(rag_result['sources'])
        
        # Calculate processing time
        processing_time_ms = (time.time() - start_time) * 1000
        
        # Browser-local inference happens before the HTTP analysis request, so add
        # its client-reported latency once to obtain an end-to-end observation.
        end_to_end_processing_time_ms = processing_time_ms + (llm_run.latency_ms if llm_run.client_reported else 0.0)
        evaluation_service.add_response_time(end_to_end_processing_time_ms)
        
        # Step 8: Create persistent audit log entry
        audit_trail_service = AuditTrailService(db)
        audit_entry = audit_trail_service.create_log_entry(
            user_id=str(current_user.id),
            user_role=current_user.role.value,
            action="FAULT_ANALYSIS",
            original_input=redact_report(full_text),
            cleaned_input=cleaned_data.cleaned_text,
            extracted_entities=extracted_entities,
            classification_result={
                'severity': classification.severity.value,
                'importance': classification.importance.value,
                'fault_level': classification.fault_level.value,
                'is_emergency': classification.is_emergency,
                'requires_specialist': classification.requires_specialist,
                'classification_source': classification_source,
                'routing_target': routing_target,
                'routing_is_proposal': True,
                'safety_guards': safety_guards,
                'rule_baseline': {
                    'severity': rule_classification.severity.value,
                    'importance': rule_classification.importance.value,
                    'fault_level': rule_classification.fault_level.value,
                    'is_emergency': rule_classification.is_emergency,
                    'requires_specialist': rule_classification.requires_specialist,
                },
                'llm': llm_run.model_dump(),
                'customer_support': support_result,
            },
            retrieved_chunks=rag_result['retrieved_context'],
            retrieval_scores=[],
            sources=sources,
            generated_response=rag_result['response'],
            confidence_score=rag_result['confidence'],
            safety_check_result={
                'safety_level': safety_check.safety_level.value,
                'requires_clinical_approval': safety_check.requires_clinical_approval,
                'requires_specialist_escalation': safety_check.requires_specialist_escalation
            },
            processing_time_ms=end_to_end_processing_time_ms,
            requires_review=rag_result['requires_review']
        )

        workflow_payload = None
        if request.report_id is not None:
            workflow = FaultResolutionWorkflowService(db).record_analysis(
                request.report_id,
                audit_log_id=audit_entry.id,
                classification_source=classification_source,
                fault_category=llm_run.browser_category or (llm_run.decision.fault_category if llm_run.decision else None),
                routing_target=routing_target,
                llm_status=llm_run.status,
                llm_provider=llm_run.provider,
                llm_model=llm_run.model or llm_run.requested_model,
                llm_revision=llm_run.model_revision,
                llm_latency_ms=llm_run.latency_ms,
                total_processing_time_ms=end_to_end_processing_time_ms,
                selected_reference_id=support_result.get('selected_reference_id'),
                reference_source=reference_lookup.get('source', ''),
                recommended_solution=reference_lookup.get('recommended_solution', ''),
                verification_instructions=reference_lookup.get('verification_before_return_to_service', ''),
                severity=classification.severity.value,
            )
            workflow_payload = FaultResolutionWorkflowService.to_dict(workflow)
        
        # Add to duplicate detection if not duplicate
        if not duplicate_check:
            duplicate_detection_service.add_report(
                report_id=f"REPORT_{audit_entry.id}",
                report_data={
                    **report_data,
                    'fault_type': classification.fault_level.value,
                    'device_id': f"{device_type}_{model}"
                }
            )
        
        # Merge reference lookup output into the canonical response; values are loaded from
        # the permanent local rule database imported from the extracted workbook data.
        return FaultAnalysisResponse(
            # Primary reference lookup fields
            device=reference_lookup.get("device", ""),
            matched_fault=reference_lookup.get("matched_fault", ""),
            meaning=reference_lookup.get("meaning", ""),
            possible_causes=reference_lookup.get("possible_causes", ""),
            immediate_safety_action=reference_lookup.get("immediate_safety_action", ""),
            recommended_solution=reference_lookup.get("recommended_solution", ""),
            verification_before_return_to_service=reference_lookup.get("verification_before_return_to_service", ""),
            source=reference_lookup.get("source", ""),
            reference_url=reference_lookup.get("reference_url", ""),
            reference_page=reference_lookup.get("reference_page", ""),
            match_confidence=float(reference_lookup.get("match_confidence") or 0.0),
            match_status=reference_lookup.get("match_status") or "NO_MATCH",

            # Data cleaning results
            cleaned_text=cleaned_data.cleaned_text,
            removed_patient_data=["[REDACTED]"] if cleaned_data.removed_patient_data or "[REDACTED]" in cleaned_data.cleaned_text else [],
            detected_language=cleaned_data.detected_language,

            # Duplicate detection
            is_duplicate=duplicate_check is not None,
            duplicate_report_id=duplicate_check.original_report_id if duplicate_check else None,
            duplicate_similarity_score=duplicate_check.similarity_score if duplicate_check else None,

            # Classification results
            severity=classification.severity.value,
            importance=classification.importance.value,
            fault_level=classification.fault_level.value,
            is_emergency=classification.is_emergency,
            requires_specialist=classification.requires_specialist,
            safety_impact=classification.safety_impact,

            # NLP extracted entities
            extracted_entities=entities_response,

            # Knowledge base results
            troubleshooting_steps=filtered_steps,
            safety_precautions=safety_precautions,
            error_code_meaning=error_code_meaning,
            calibration_procedures=calibration_procedures,

            # RAG results
            rag_response=rag_result['response'],
            rag_sources=rag_result['sources'],
            rag_confidence=rag_result['confidence'],
            reference_found=reference_found,

            # Safety check results
            safety_level=safety_check.safety_level.value,
            recommendation_type=safety_check.recommendation_type.value,
            warning_message=safety_check.warning_message,
            requires_clinical_approval=safety_check.requires_clinical_approval,
            allowed_actions=safety_check.allowed_actions,
            prohibited_actions=safety_check.prohibited_actions,

            # Escalation information
            escalation_required=escalation_decision['escalation_required'],
            escalation_level=escalation_decision['escalation_level'],
            escalation_actions=escalation_decision['required_actions'],
            mandatory_procedures=escalation_decision.get('mandatory_procedures', []),

            # Recommendations
            recommended_action=classification.recommended_action,
            estimated_resolution_time=classification.estimated_resolution_time,

            # Metadata
            confidence_score=avg_confidence,
            sources=sources,
            audit_log_id=audit_entry.id,
            classification_source=classification_source,
            fault_category=llm_run.browser_category or (llm_run.decision.fault_category if llm_run.decision else None),
            routing_target=routing_target,
            safety_guards=safety_guards,
            llm=llm_run,
            customer_support=support_result,
            workflow=workflow_payload,
        )
        
    except HTTPException:
        raise
    except Exception:
        logger.error("Fault analysis failed for device_id=%s", device.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fault analysis failed. Please try again or contact support."
        )


@router.post("/import-reference-rules")
def import_reference_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Synchronize the bundled manufacturer reference JSON (administrator only)."""
    if current_user.role != UserRole.ADMINISTRATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator role required",
        )

    json_path = Path(__file__).resolve().parents[2] / "reference_data" / "medical_device_fault_reference.json"
    service = FaultReferenceLookupService(db)
    imported = service.load_rules_from_json(str(json_path))
    return {
        "imported": imported,
        "json_path": str(json_path),
        "message": "Reference rules synchronized with the bundled manufacturer database."
    }


@router.get("/device-types")
def get_supported_device_types():
    """Get list of supported device types for classification"""
    return {
        "device_types": list(classification_service.device_severity_weights.keys()),
        "severity_weights": classification_service.device_severity_weights
    }


@router.get("/escalation-paths/{severity}")
def get_escalation_path(severity: str):
    """Get escalation path for a given severity level"""
    paths = knowledge_service.get_escalation_path(severity.upper())
    if not paths:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No escalation path found for severity: {severity}"
        )
    
    return {
        "severity": severity,
        "escalation_path": [
            {
                "level": path.level,
                "title": path.title,
                "required_expertise": path.required_expertise,
                "estimated_time": path.estimated_time,
                "actions": path.actions,
                "contacts": path.contacts,
                "criteria": path.criteria
            }
            for path in paths
        ]
    }


@router.post("/extract-entities")
def extract_entities(text: str):
    """Extract entities from fault report text using NLP"""
    entities = nlp_service.extract_entities(text)
    
    return {
        "entities": {
            entity_type: [
                {
                    "value": entity.value,
                    "confidence": entity.confidence,
                    "position": {"start": entity.start_pos, "end": entity.end_pos}
                }
                for entity in entity_list
            ]
            for entity_type, entity_list in entities.items()
        }
    }


@router.get("/service-manual/{device_type}")
def get_service_manual(
    device_type: str,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None
):
    """Get service manual information for a device"""
    manual = knowledge_service.get_service_manual(device_type, manufacturer, model)
    
    if not manual:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No service manual found for device type: {device_type}"
        )
    
    return {
        "device_type": manual.device_type,
        "manufacturer": manual.manufacturer,
        "model": manual.model,
        "troubleshooting_steps": manual.troubleshooting_steps,
        "safety_precautions": manual.safety_precautions,
        "error_codes": manual.error_codes,
        "calibration_procedures": manual.calibration_procedures,
        "parts_list": manual.parts_list
    }


@router.post("/safety-check")
def perform_safety_check(
    recommendation: str,
    device_type: str,
    patient_connected: bool = False,
    current_user: User = Depends(get_current_active_user)
):
    """Perform safety check on a recommendation"""
    safety_check = safety_service.check_recommendation_safety(
        recommendation=recommendation,
        user_role=current_user.role.value,
        device_type=device_type,
        patient_connected=patient_connected
    )
    
    return {
        "is_safe": safety_check.is_safe,
        "safety_level": safety_check.safety_level.value,
        "recommendation_type": safety_check.recommendation_type.value,
        "warning_message": safety_check.warning_message,
        "requires_clinical_approval": safety_check.requires_clinical_approval,
        "requires_specialist_escalation": safety_check.requires_specialist_escalation,
        "allowed_actions": safety_check.allowed_actions,
        "prohibited_actions": safety_check.prohibited_actions
    }


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get audit trail logs"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can view audit logs"
        )
    
    logs = AuditTrailService(db).get_all_logs(limit)
    
    return {
        "logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "user_id": log.user_id,
                "user_role": log.user_role,
                "action": log.action,
                "original_input": log.original_input,
                "classification_result": log.classification_result,
                "sources": log.sources,
                "confidence_score": log.confidence_score,
                "processing_time_ms": log.processing_time_ms,
                "review_status": log.review_status,
                "engineer_decision": log.engineer_decision
            }
            for log in logs
        ]
    }


@router.get("/audit-logs/pending")
def get_pending_reviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get pending review logs"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can view pending reviews"
        )
    
    pending = AuditTrailService(db).get_pending_reviews()
    
    return {
        "pending_reviews": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "user_id": log.user_id,
                "original_input": log.original_input,
                "generated_response": log.generated_response,
                "confidence_score": log.confidence_score
            }
            for log in pending
        ]
    }


@router.post("/audit-logs/{log_id}/decision")
def add_engineer_decision(
    log_id: str,
    decision: str,
    comments: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Add engineer decision to audit log"""
    decision = decision.strip().upper()
    allowed_decisions = {"APPROVED", "MODIFIED", "ESCALATED", "REJECTED"}
    if decision not in allowed_decisions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"decision must be one of: {', '.join(sorted(allowed_decisions))}"
        )
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can add decisions"
        )
    
    entry = AuditTrailService(db).add_engineer_decision(log_id, decision, comments)
    if entry:
        FaultResolutionWorkflowService(db).record_specialist_decision_by_audit(
            log_id, decision=decision, comments=comments, user_id=current_user.id
        )
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit log entry not found: {log_id}"
        )
    
    return {
        "message": "Decision added successfully",
        "log_id": log_id,
        "decision": decision,
        "comments": comments,
        "decision_timestamp": entry.decision_timestamp.isoformat()
    }


@router.get("/recurring-faults")
def get_recurring_faults(
    time_period_days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get recurring fault patterns"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can view recurring faults"
        )
    
    patterns = DuplicateDetectionService(db).analyze_recurring_faults(time_period_days)
    
    return {
        "time_period_days": time_period_days,
        "recurring_faults": [
            {
                "device_type": pattern.device_type,
                "fault_type": pattern.fault_type,
                "occurrence_count": pattern.occurrence_count,
                "time_period": pattern.time_period,
                "affected_devices": pattern.affected_devices,
                "affected_departments": pattern.affected_departments,
                "pattern_description": pattern.pattern_description,
                "recommended_action": pattern.recommended_action
            }
            for pattern in patterns
        ]
    }


@router.get("/statistics")
def get_system_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get system statistics including audit trail and duplicate detection"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can view statistics"
        )
    
    audit_stats = AuditTrailService(db).get_statistics()
    duplicate_stats = DuplicateDetectionService(db).get_statistics()
    
    return {
        "audit_trail": audit_stats,
        "duplicate_detection": duplicate_stats,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/evaluation/labeled-report")
def add_labeled_report(
    report_id: str,
    true_severity: str,
    true_importance: str,
    true_fault_level: str,
    predicted_severity: str,
    predicted_importance: str,
    predicted_fault_level: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Add labeled report for classification evaluation"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can add labeled reports"
        )
    
    EvaluationService(db).add_labeled_report(
        report_id=report_id,
        true_severity=true_severity,
        true_importance=true_importance,
        true_fault_level=true_fault_level,
        predicted_severity=predicted_severity,
        predicted_importance=predicted_importance,
        predicted_fault_level=predicted_fault_level
    )
    
    return {"message": "Labeled report added successfully"}


@router.post("/evaluation/solution-quality")
def add_solution_evaluation(
    report_id: str,
    quality_score: float,
    clarity_score: float,
    applicability_score: float,
    expert_id: str,
    comments: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Add expert evaluation of solution quality"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can add solution evaluations"
        )
    
    EvaluationService(db).add_solution_evaluation(
        report_id=report_id,
        quality_score=quality_score,
        clarity_score=clarity_score,
        applicability_score=applicability_score,
        expert_id=expert_id,
        comments=comments
    )
    
    return {"message": "Solution evaluation added successfully"}


@router.post("/evaluation/user-survey")
def add_user_survey(
    user_id: str,
    satisfaction_score: float,
    ease_of_use_score: float,
    usefulness_score: float,
    would_recommend: bool,
    comments: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Add user satisfaction survey"""
    EvaluationService(db).add_user_survey(
        user_id=user_id,
        satisfaction_score=satisfaction_score,
        ease_of_use_score=ease_of_use_score,
        usefulness_score=usefulness_score,
        would_recommend=would_recommend,
        comments=comments
    )
    
    return {"message": "User survey added successfully"}


@router.post("/evaluation/escalation-decision")
def add_escalation_decision(
    report_id: str,
    was_escalated: bool,
    should_have_escalated: bool,
    escalation_level: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Record escalation decision for accuracy evaluation"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can add escalation decisions"
        )
    
    EvaluationService(db).add_escalation_decision(
        report_id=report_id,
        was_escalated=was_escalated,
        should_have_escalated=should_have_escalated,
        escalation_level=escalation_level
    )
    
    return {"message": "Escalation decision added successfully"}


@router.get("/evaluation/comprehensive")
def get_comprehensive_evaluation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get comprehensive evaluation report"""
    if current_user.role not in {UserRole.ADMINISTRATOR, UserRole.BIOMEDICAL_ENGINEER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and biomedical engineers can view evaluation reports"
        )
    
    evaluation = EvaluationService(db).get_comprehensive_evaluation()
    
    return {
        "classification_metrics": {
            "accuracy": evaluation['classification_metrics'].accuracy,
            "precision": evaluation['classification_metrics'].precision,
            "recall": evaluation['classification_metrics'].recall,
            "f1_score": evaluation['classification_metrics'].f1_score,
            "true_positives": evaluation['classification_metrics'].true_positives,
            "false_positives": evaluation['classification_metrics'].false_positives,
            "true_negatives": evaluation['classification_metrics'].true_negatives,
            "false_negatives": evaluation['classification_metrics'].false_negatives
        },
        "solution_quality_metrics": {
            "average_quality_score": evaluation['solution_quality_metrics'].average_quality_score,
            "clarity_score": evaluation['solution_quality_metrics'].clarity_score,
            "applicability_score": evaluation['solution_quality_metrics'].applicability_score,
            "expert_evaluations": evaluation['solution_quality_metrics'].expert_evaluations,
            "safe_recommendations": evaluation['solution_quality_metrics'].safe_recommendations,
            "unsafe_recommendations": evaluation['solution_quality_metrics'].unsafe_recommendations,
            "out_of_scope_recommendations": evaluation['solution_quality_metrics'].out_of_scope_recommendations
        },
        "response_time_metrics": {
            "average_time_ms": evaluation['response_time_metrics'].average_time_ms,
            "median_time_ms": evaluation['response_time_metrics'].median_time_ms,
            "p95_time_ms": evaluation['response_time_metrics'].p95_time_ms,
            "p99_time_ms": evaluation['response_time_metrics'].p99_time_ms,
            "target_time_ms": evaluation['response_time_metrics'].target_time_ms
        },
        "user_satisfaction_metrics": {
            "average_satisfaction_score": evaluation['user_satisfaction_metrics'].average_satisfaction_score,
            "ease_of_use_score": evaluation['user_satisfaction_metrics'].ease_of_use_score,
            "usefulness_score": evaluation['user_satisfaction_metrics'].usefulness_score,
            "total_surveys": evaluation['user_satisfaction_metrics'].total_surveys,
            "would_recommend_percentage": evaluation['user_satisfaction_metrics'].would_recommend_percentage
        },
        "escalation_metrics": {
            "correct_escalations": evaluation['escalation_metrics'].correct_escalations,
            "incorrect_escalations": evaluation['escalation_metrics'].incorrect_escalations,
            "escalation_accuracy": evaluation['escalation_metrics'].escalation_accuracy,
            "missed_escalations": evaluation['escalation_metrics'].missed_escalations,
            "false_escalations": evaluation['escalation_metrics'].false_escalations
        },
        "evaluation_timestamp": evaluation['evaluation_timestamp']
    }
