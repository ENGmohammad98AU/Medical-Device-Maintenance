"""Unverified, bounded LLM drafts, separate from the manufacturer catalogue.

The hash catches stale inputs, not forged client inference. Safety checks here
are conservative rejection filters, not a certification of generated content.
"""
import hashlib
import json
import re
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.services.llm_triage_service import redact_report
from app.services.fault_classification_service import FaultClassificationService

MANIFEST = json.loads((Path(__file__).parent / "guidance_llm_manifest.json").read_text(encoding="utf-8"))
PROMPT_HASH = hashlib.sha256(json.dumps(MANIFEST, sort_keys=True).encode()).hexdigest()


class BrowserGuidanceResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    status: Literal["success", "error"]
    version: str = Field(max_length=80)
    input_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    latency_ms: float = Field(ge=0, le=45000, allow_inf_nan=False)
    text: Optional[str] = Field(default=None, min_length=20, max_length=1200)
    reference_id: Optional[str] = Field(default=None, min_length=1, max_length=100)
    finish_reason: Optional[Literal["stop"]] = None
    prompt_tokens: Optional[int] = Field(default=None, ge=1, le=2048)
    completion_tokens: Optional[int] = Field(default=None, ge=1, le=128)
    error_code: Optional[Literal["timeout", "input_too_long", "invalid_output", "load_failed", "not_allowed", "out_of_scope"]] = None

    @model_validator(mode="after")
    def check_status(self):
        if self.status == "success":
            if not self.text or self.finish_reason != "stop" or not self.prompt_tokens or not self.completion_tokens or self.error_code:
                raise ValueError("A draft requires completed text and token counts")
        elif self.text is not None or self.finish_reason is not None or self.reference_id is not None or self.error_code is None:
            raise ValueError("Failed generation cannot provide draft text")
        return self


def prepare_guidance(request, device, references):
    # Maintenance guidance is reference-grounded by construction. If the
    # server cannot shortlist trusted evidence, do not even offer a generation
    # context to the client/local model.
    if not request.generate_guidance or not references:
        return None
    report = f"{request.fault} {request.description}".strip()
    device_type = device.type.value.upper().replace("-", "_").replace(" ", "_")
    baseline = FaultClassificationService().classify_fault(
        device_type=device_type, error_message=report, customer_expertise=request.customer_expertise,
        device_location=request.device_location, patient_connected=request.patient_connected)
    # The short generated answer explains the complete meaning. Preserve all
    # procedure fields in the context binding and the server-owned reference
    # response; do not turn a shortened procedure into maintenance instructions.
    evidence = [{"reference_id": ref["reference_id"], "symptom": ref["matched_fault"],
                 "meaning": ref.get("meaning", ""),
                 "evidence": "\n".join(f"{field}: {ref[field]}" for field in (
                     "meaning", "possible_causes", "immediate_safety_action", "recommended_solution",
                     "verification_before_return_to_service") if ref.get(field))}
                for ref in references]
    context = {"version": MANIFEST["version"], "device_name": f"{device.name} ({device.manufacturer} {device.model})",
               "report_text": redact_report(report), "references": evidence}
    if request.patient_connected or baseline.is_emergency:
        context["blocked_reason"] = "PATIENT_OR_EMERGENCY"
    binding = {"context": context, "report": report, "device_id": device.id, "references": references,
               "patient_connected": request.patient_connected, "expertise": request.customer_expertise,
               "prompt_sha256": PROMPT_HASH}
    context["input_sha256"] = hashlib.sha256(json.dumps(binding, ensure_ascii=False, sort_keys=True,
                                                       separators=(",", ":")).encode()).hexdigest()
    return context


# Reject intrusive/clinical procedures, invented links and leaked instructions.
# A draft that passes still requires a qualified human review before any action.
UNSAFE = re.compile(
    r"(?:اسأل|اسال|استشر|اطلب من).{0,12}(?:المريض|مريض)|\b(?:ask|consult|question)\b.{0,15}\bpatient\b|"
    r"\b(?:check|assess|monitor|evaluate|observe|examine)\b.{0,45}\b(?:patient|breathing pattern|respiratory distress)\b|"
    r"https?://|[<>]|(?:open|remove|unscrew).{0,25}(?:cover|housing|case)|"
    r"\b(?:calibrat\w*|reboot|reset|bypass|dosage|dose|sedat\w*|solder\w*)\b|"
    r"(?:disable|silence|change|adjust).{0,25}(?:alarm|limit|flow|rate|pressure|voltage)|"
    r"\b(?:replace|replacement|repair)\b|"
    # Reject approval/directives, while allowing a sourced prerequisite such as
    # "Verify alarm clearance before returning to service".
    r"(?:^|[.!?]\s+|\n)\s*(?:\d+[.)]\s*)?(?:return|restore)\b.{0,30}(?:service|clinical use)|"
    r"\b(?:you can|you may|can now|may now|please)\b.{0,20}(?:return|restore).{0,30}(?:service|clinical use)|"
    r"\b(?:safe to use|ready for clinical use)\b|"
    r"(?:disconnect|unplug).{0,25}(?:patient|ventilator|infusion)|"
    r"(?:فتح|افتح|فك|أزل|إزالة).{0,18}(?:غطاء|الغلاف|هيكل|لوحة)|"
    r"معاير|جرع|تخدير|لحام|تجاوز|إعادة (?:تشغيل|ضبط)|اعاده (?:تشغيل|ضبط)|"
    r"(?:عطل|تعطيل|إسكات|اكتم|غير|غيّر|اضبط|ضبط|رفع|خفض).{0,22}(?:إنذار|انذار|تدفق|جرع|ضغط|جهد)|"
    r"(?:استبدل|استبدال|أصلح|إصلاح).{0,22}(?:لوح|صمام|محرك|بطاري|مصهر)|"
    r"(?:افصل|فصل).{0,22}(?:مريض|المريض|التنفس|المضخة)|"
    r"(?:أعد|إعادة).{0,15}(?:الخدمة|للاستخدام)", re.IGNORECASE)

QUANTITY = re.compile(
    r"(?<![\w.])[-+]?\d+(?:[.,]\d+)?\s*(?:%|percent\b|(?:milli)?volts?\b|m?v\b|"
    r"(?:milli)?amps?\b|m?a\b|mmhg\b|kpa\b|psi\b|hz\b|seconds?\b|minutes?\b|hours?\b)", re.I)


def supported_quantities(text, evidence):
    def quantities(value):
        return {re.sub(r"percent$", "%", re.sub(r"\s+", "", match.group().lower()))
                for match in QUANTITY.finditer(value)}
    return quantities(text).issubset(quantities(evidence))


def resolve_guidance(context, result, llm_run, *, patient_connected, is_emergency,
                     selected_reference=None, out_of_scope=False):
    if context is None and result is None:
        return None
    metadata = {"status": "UNAVAILABLE", "text": "", "requires_review": True, "client_reported": True,
                "origin": "LLM_GENERATED", "prompt_version": MANIFEST["version"], "prompt_sha256": PROMPT_HASH,
                "output_language": "en", "evidence_status": "NO_MATCHING_REFERENCE", "sources": [],
                "model": llm_run.model, "model_revision": llm_run.model_revision, "runtime": llm_run.runtime,
                "message": "Text generation did not finish. Retry or refer the report to a biomedical engineer."}
    if context is None or result is None:
        metadata["error_code"] = "missing_context" if context is None else "missing_result"
        return metadata
    metadata["latency_ms"] = result.latency_ms
    if (llm_run.status != "success" or result.version != MANIFEST["version"]
            or result.input_sha256 != context["input_sha256"]):
        metadata["error_code"] = "context_mismatch"
        return metadata
    if selected_reference is None:
        metadata.update(
            status="BLOCKED",
            error_code="not_allowed",
            message="No accepted technical reference was selected, so the local model cannot generate maintenance guidance.",
        )
        return metadata
    if patient_connected or is_emergency or context.get("blocked_reason") or llm_run.browser_category == "UNKNOWN" or out_of_scope:
        metadata.update(status="BLOCKED", error_code="not_allowed",
                        message="Generation is unavailable for patient-connected equipment, emergencies, unclear or out-of-scope requests. Follow the specialist review pathway.")
        return metadata
    if result.status != "success":
        metadata["error_code"] = result.error_code
        if result.error_code == "timeout":
            metadata["message"] = "Generation timed out without a complete answer. Retry or request specialist review."
        elif result.error_code == "input_too_long":
            metadata["message"] = "The report or evidence exceeds the local model capacity. Shorten the report while preserving the alarm and important symptoms."
        return metadata
    expected_reference_id = selected_reference.get("reference_id") if selected_reference else None
    if result.reference_id != expected_reference_id:
        metadata["error_code"] = "reference_mismatch"
        return metadata
    text = result.text.strip()
    supplied = context["report_text"]
    if selected_reference:
        reference = next((ref for ref in context["references"] if ref["reference_id"] == expected_reference_id), None)
        if reference is None:
            metadata["error_code"] = "reference_mismatch"
            return metadata
        supplied = reference.get("meaning", "").strip() or reference["evidence"]
    if (len(text) < 20 or UNSAFE.search(text) or re.search(r"[^\x20-\x7e\n]|`", text)
            or not supported_quantities(text, supplied)
            or not re.search(r"[A-Za-z]{3}", text) or not re.search(r"[.!?]$", text)
            or (not selected_reference and not re.search(
                r"\b(?:unconfirmed|uncertain|unknown|cannot confirm|not confirmed|not established|insufficient|no matching|no reference)\b", text, re.I))
            or redact_report(text) != text):
        metadata.update(status="BLOCKED", error_code="content_rejected",
                        message="The answer did not pass the English-language and content checks. A biomedical engineer must review the report.")
        return metadata
    metadata.update(status="DRAFT", text=text, completion_tokens=result.completion_tokens,
                    message="No matching manufacturer evidence is available. This generated preliminary answer is unverified and requires a biomedical engineer's review.")
    if selected_reference:
        metadata.update(evidence_status="REFERENCE_PROVIDED", sources=[{
            "reference_id": selected_reference["reference_id"], "source": selected_reference["source"],
            "reference_url": selected_reference["reference_url"], "reference_page": selected_reference.get("reference_page", ""),
        }], evidence_scope="ALARM_MEANING" if selected_reference.get("meaning", "").strip() else "FULL_REFERENCE",
            message=("Generated explanation of the documented alarm meaning. Read the complete manufacturer reference for maintenance instructions; a biomedical engineer must review the answer."
                     if selected_reference.get("meaning", "").strip() else
                     "Generated explanation using the reference below. Source availability does not verify every generated claim; a biomedical engineer must review the answer."))
    return metadata
