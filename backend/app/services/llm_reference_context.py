"""Manufacturer context for LLM selection, outside the 39-fault catalogue.

These source excerpts are never imported into the reference-rule table. A valid
model selection is required before their technical guidance can be returned.
"""
import json
from pathlib import Path


CATALOGUE_PATH = Path(__file__).resolve().parents[2] / "reference_data" / "medical_device_fault_reference.json"
CONTEXT_PATH = Path(__file__).resolve().parents[2] / "llm_context" / "medical_device_context.json"

# Only these previously bundled additions are retired during catalogue import.
# Do not delete unrelated administrator-imported records or historical audits.
RETIRED_CATALOGUE_IDS = frozenset({
    "HAM-C6-013", "HAM-C6-014", "PH-MX800-013", "PH-MX800-014",
    "PH-MX800-015", "BB-PS-016",
})


def load_llm_context():
    data = json.loads(CONTEXT_PATH.read_text(encoding="utf-8"))
    if data.get("schema_version") != "llm-device-context-v1":
        raise ValueError("Unsupported LLM reference context version")
    return data["excerpts"]
