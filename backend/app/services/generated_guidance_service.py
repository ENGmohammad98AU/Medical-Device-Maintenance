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
    text: Optional[str] = Field(default=None, min_length=20, max_length=800)
    finish_reason: Optional[Literal["stop"]] = None
    prompt_tokens: Optional[int] = Field(default=None, ge=1, le=1024)
    completion_tokens: Optional[int] = Field(default=None, ge=1, le=96)
    error_code: Optional[Literal["timeout", "input_too_long", "invalid_output", "load_failed", "not_allowed", "out_of_scope"]] = None

    @model_validator(mode="after")
    def check_status(self):
        if self.status == "success":
            if not self.text or self.finish_reason != "stop" or not self.prompt_tokens or not self.completion_tokens or self.error_code:
                raise ValueError("A draft requires completed text and token counts")
        elif self.text is not None or self.finish_reason is not None or self.error_code is None:
            raise ValueError("Failed generation cannot provide draft text")
        return self


def prepare_guidance(request, device, references):
    if not request.generate_guidance or (references and references[0].get("reference_origin", "CATALOGUE") == "CATALOGUE"):
        return None
    report = f"{request.fault} {request.description}".strip()
    device_type = device.type.value.upper().replace("-", "_").replace(" ", "_")
    baseline = FaultClassificationService().classify_fault(
        device_type=device_type, error_message=report, customer_expertise=request.customer_expertise,
        device_location=request.device_location, patient_connected=request.patient_connected)
    context = {"version": MANIFEST["version"], "device_name": f"{device.name} ({device.manufacturer} {device.model})",
               "report_text": redact_report(report)}
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
    r"https?://|[<>]|(?:open|remove|unscrew).{0,25}(?:cover|housing|case)|"
    r"\b(?:calibrat\w*|reboot|reset|bypass|dosage|dose|sedat\w*|solder\w*)\b|"
    r"(?:disable|silence|change|adjust).{0,25}(?:alarm|limit|flow|rate|pressure|voltage)|"
    r"(?:replace|repair).{0,25}(?:board|fuse|battery|valve|motor)|"
    r"(?:disconnect|unplug).{0,25}(?:patient|ventilator|infusion)|"
    r"(?:فتح|افتح|فك|أزل|إزالة).{0,18}(?:غطاء|الغلاف|هيكل|لوحة)|"
    r"معاير|جرع|تخدير|لحام|تجاوز|إعادة (?:تشغيل|ضبط)|اعاده (?:تشغيل|ضبط)|"
    r"(?:عطل|تعطيل|إسكات|اكتم|غير|غيّر|اضبط|ضبط|رفع|خفض).{0,22}(?:إنذار|انذار|تدفق|جرع|ضغط|جهد)|"
    r"(?:استبدل|استبدال|أصلح|إصلاح).{0,22}(?:لوح|صمام|محرك|بطاري|مصهر)|"
    r"(?:افصل|فصل).{0,22}(?:مريض|المريض|التنفس|المضخة)|"
    r"(?:أعد|إعادة).{0,15}(?:الخدمة|للاستخدام)", re.IGNORECASE)


def resolve_guidance(context, result, llm_run, *, patient_connected, is_emergency):
    if context is None and result is None:
        return None
    metadata = {"status": "UNAVAILABLE", "text": "", "requires_review": True, "client_reported": True,
                "origin": "LLM_GENERATED", "prompt_version": MANIFEST["version"], "prompt_sha256": PROMPT_HASH,
                "model": llm_run.model, "model_revision": llm_run.model_revision, "runtime": llm_run.runtime,
                "message": "لم يكتمل التوليد النصي. أعد المحاولة أو أحل البلاغ إلى مهندس الأجهزة الطبية."}
    if context is None or result is None:
        metadata["error_code"] = "missing_context" if context is None else "missing_result"
        return metadata
    metadata["latency_ms"] = result.latency_ms
    if (llm_run.status != "success" or result.version != MANIFEST["version"]
            or result.input_sha256 != context["input_sha256"]):
        metadata["error_code"] = "context_mismatch"
        return metadata
    if patient_connected or is_emergency or context.get("blocked_reason") or llm_run.browser_category == "UNKNOWN":
        metadata.update(status="BLOCKED", error_code="not_allowed",
                        message="لا تُولّد خطوات صيانة لجهاز موصول بالمريض أو حالة طارئة أو وصف غير واضح. اتبع مسار المراجعة المختصة.")
        return metadata
    if result.status != "success":
        metadata["error_code"] = result.error_code
        if result.error_code == "timeout":
            metadata["message"] = "انتهت مهلة التوليد دون مسودة مكتملة؛ لم يُعرض نص مقطوع. أعد المحاولة أو اطلب مراجعة المختص."
        return metadata
    text = result.text.strip()
    if (UNSAFE.search(text) or not re.fullmatch(r"1[.)] [^\n]+[.؟!?]\n+2[.)] [^\n]+[.؟!?]", text)
            or redact_report(text) != text):
        metadata.update(status="BLOCKED", error_code="content_rejected",
                        message="لم تجتز المسودة فحص المحتوى؛ يلزم مهندس الأجهزة الطبية لاستكمال الإرشادات.")
        return metadata
    metadata.update(status="DRAFT", text=text, completion_tokens=result.completion_tokens,
                    message="إرشادات أولية مولّدة من وصفك، وليست تعليمات معتمدة من الشركة. يراجعها المختص قبل التنفيذ على جهاز خارج الخدمة وغير موصول بالمريض.")
    return metadata
