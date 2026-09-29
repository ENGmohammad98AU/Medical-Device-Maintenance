"""Local LLM reference selection with server-owned sources and explicit scope.

The browser result is a proposal, not proof of inference or of a repaired device.
The server reconstructs candidates so client-supplied repair text is never used.
"""
import hashlib
import json
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.services.fault_reference_lookup_service import FaultReferenceLookupService, NO_MATCH
from app.services.llm_triage_service import redact_report
from app.services.fault_report_text import normalize_report_text
from app.services.llm_reference_context import load_llm_context

MANIFEST = json.loads((Path(__file__).parent / "support_llm_manifest.json").read_text(encoding="utf-8"))
PROMPT_HASH = hashlib.sha256(json.dumps(MANIFEST, sort_keys=True).encode()).hexdigest()


class BrowserSupportResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    status: Literal["success", "error"]
    version: str = Field(max_length=80)
    input_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    output_token: Optional[Literal["A", "B", "C", "D", "E"]] = None
    latency_ms: float = Field(default=0, ge=0, le=1000000, allow_inf_nan=False)
    error_code: Optional[Literal["cancelled", "timeout", "unsupported_browser", "load_failed", "input_too_long", "invalid_output"]] = None

    @model_validator(mode="after")
    def check_status(self):
        if self.status == "success" and (self.output_token is None or self.error_code is not None):
            raise ValueError("Successful selection needs a token and no error")
        if self.status == "error" and (self.output_token is not None or self.error_code is None):
            raise ValueError("Failed selection needs an error and no token")
        return self


def prepare_support(request, device, db):
    device_type = device.type.value.upper().replace("-", "_").replace(" ", "_")
    report_text = f"{request.fault} {request.description}".strip()
    references = FaultReferenceLookupService(db).support_candidates(
        device_query=device.name, manufacturer=device.manufacturer, model=device.model,
        device_type=device_type, description=request.description, fault_query=request.fault,
        llm_context_records=load_llm_context(),
    )
    context = {
        "version": MANIFEST["version"], "report_text": redact_report(report_text),
        "device_name": f"{device.name} ({device.manufacturer} {device.model})",
        "candidates": [{"label": "ABC"[i], "reference_id": r["reference_id"], "symptom": r["symptom"]}
                       for i, r in enumerate(references)],
    }
    # Includes complete reference content, device and patient/expertise context.
    # Detects stale data; an untrusted browser can still forge its own proposal.
    binding = {"context": context, "references": references, "report_text": report_text,
               "device_id": device.id, "patient_connected": request.patient_connected,
               "customer_expertise": request.customer_expertise, "prompt_sha256": PROMPT_HASH}
    context["input_sha256"] = hashlib.sha256(json.dumps(binding, ensure_ascii=False, sort_keys=True,
                                                       separators=(",", ":")).encode()).hexdigest()
    return context, references


def clarification_questions(context):
    questions = ["What exact error message or alarm code is displayed on the device?",
                 "When did the problem start, and what behavior do you observe?"]
    identity = context["device_name"].casefold()
    report = normalize_report_text(context["report_text"]).casefold()
    if "philips" in identity and "mx800" in identity:
        if "batt" in report or "بطاري" in report:
            questions.append("Does the battery alarm come from the MX800, an X2/X3 module, or an external power accessory? Specify the module and model.")
        else:
            questions.append("Which measurement channel shows the alarm: ECG, Resp, SpO2, or NBP?")
    elif "hamilton" in identity and "c6" in identity:
        questions.append("Is the device using AC or battery power? Does the alarm concern power, oxygen, or the breathing circuit?")
    elif "perfusor" in identity and "space" in identity:
        questions.append("Does the alarm concern the battery, syringe placement, or infusion-line pressure? Has pumping stopped?")
    questions.append("Are the selected device name, manufacturer, and model correct?")
    return questions


def resolve_support(context, references, result, llm_run, fallback):
    """Return a server-owned reference, review metadata and fallback suppression."""
    metadata = {
        "status": "FALLBACK", "scope": "UNCONFIRMED", "method": "REFERENCE_RULES",
        "selected_reference_id": None, "candidate_ids": [r["reference_id"] for r in references],
        "message": "This result comes from reference lookup; no valid model selection was available.",
        "guards": [],
        "questions": [], "requires_review": True, "client_reported": result is not None,
        "reference_status": "CANDIDATES_AVAILABLE" if references else "NO_MATCHING_REFERENCE",
        "prompt_version": MANIFEST["version"], "prompt_sha256": PROMPT_HASH,
        "model": llm_run.model, "model_revision": llm_run.model_revision,
        "runtime": llm_run.runtime, "result": result.model_dump() if result else None,
    }
    if not references:
        metadata.update(
            status="NO_REFERENCE",
            scope="UNCONFIRMED",
            method="REFERENCE_GATE",
            message="No technical reference matches this report and device in the current knowledge base. No local-model maintenance inference was run.",
            questions=clarification_questions(context),
        )
        metadata["guards"].append("NO_REFERENCE_NO_LLM")
        return dict(NO_MATCH), metadata, True
    elif references[0].get("reference_origin") == "LLM_CONTEXT":
        metadata.update(status="LLM_REQUIRED", method="LOCAL_LLM_REQUIRED",
                        message="This alarm is outside the 39-fault catalogue. Run the local model to select from the available technical evidence, or consult a biomedical engineer.",
                        questions=clarification_questions(context))
        # Context-only answers must not leak through a rules/cloud fallback.
        fallback = dict(NO_MATCH)
    if result is None or result.status != "success":
        return fallback, metadata, False
    if (llm_run.status != "success" or result.version != MANIFEST["version"]
            or result.input_sha256 != context["input_sha256"]):
        metadata.update(status="INVALID_RESULT", message="The report or reference context has changed. Run the analysis again using the current data.")
        return dict(NO_MATCH), metadata, True
    metadata["method"] = "LOCAL_LLM_REFERENCE_SELECTION"
    token = result.output_token
    if token in "ABC" and llm_run.browser_category == "UNKNOWN":
        token = "D"
        metadata["guards"].append("CATEGORY_UNCLEAR")
    if token in "ABC":
        index = "ABC".index(token)
        if index >= len(references):
            metadata.update(status="INVALID_RESULT", message="The proposed reference could not be accepted. Describe the problem again or request specialist review.")
            return dict(NO_MATCH), metadata, True
        selected = references[index]
        metadata.update(status="SELECTED", scope="IN_SCOPE", selected_reference_id=selected["reference_id"],
                        reference_origin=selected.get("reference_origin", "CATALOGUE"), questions=[],
                        message="The model selected a reference for the reported symptoms. The source text below requires specialist review.")
        if selected.get("reference_origin") == "LLM_CONTEXT":
            metadata.update(method="LOCAL_LLM_CONTEXT_SELECTION",
                            message="The model selected manufacturer evidence for an alarm outside the 39-fault catalogue. Specialist review is required.")
        return selected, metadata, True
    if token == "E":
        metadata.update(status="OUT_OF_SCOPE", scope="OUT_OF_SCOPE", questions=[],
                        message="This request appears outside medical-device technical support. Clarify any device fault; direct treatment or medication questions to the clinical team and administrative requests to the appropriate service.")
    else:
        unclear = llm_run.browser_category == "UNKNOWN" or bool(references)
        metadata.update(status="NEEDS_DETAILS" if unclear else "NO_REFERENCE", scope="UNCONFIRMED" if unclear else "IN_SCOPE",
                        message=("The model did not select a candidate reference. Answer the following questions to continue the analysis."
                                 if references else metadata["message"]),
                        questions=clarification_questions(context))
    return dict(NO_MATCH), metadata, True
