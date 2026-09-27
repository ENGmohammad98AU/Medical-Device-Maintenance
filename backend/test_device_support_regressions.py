"""Three-device API regressions using an isolated reference database.

Browser outputs are supplied here to test the server boundary. Actual model
decisions are tested separately in the Chromium prepared-worker benchmark.
"""
import json
from pathlib import Path
from types import SimpleNamespace
import pytest

from app.models.device import Device, DeviceType, DeviceStatus
from app.models.audit_log import AuditLog
from app.services.browser_llm_service import MANIFEST, browser_input_hash
from app.services.fault_report_text import normalize_report_text
from app.services.customer_support_service import prepare_support
from test_llm_triage import api_client

DEVICES = {
    901: ("Hamilton C6 Ventilator", "Hamilton Medical", "C6", "VENTILATOR"),
    902: ("Philips IntelliVue MX800 Monitor", "Philips", "MX800", "PATIENT_MONITOR"),
    903: ("B. Braun Perfusor Space Syringe Pump", "B. Braun", "Perfusor Space", "SYRINGE_PUMP"),
}


@pytest.fixture
def three_devices(api_client):
    client, db, api = api_client
    for id in (902, 903):
        name, manufacturer, model, kind = DEVICES[id]
        db.add(Device(id=id, name=name, manufacturer=manufacturer, model=model,
                      type=DeviceType(kind.lower()), status=DeviceStatus.OPERATIONAL,
                      serial_number=f"TEST-{id}", department="TEST"))
    db.commit()
    return client, db, api


def analyze(client, device_id, report, category, reference_id=None):
    request = {"device_id": device_id, "description": report}
    prepared = client.post('/api/intelligent-support/prepare-support', json=request)
    assert prepared.status_code == 200, prepared.text
    context = prepared.json()
    if reference_id:
        token = next(c['label'] for c in context['candidates'] if c['reference_id'] == reference_id)
    else:
        token = 'D'
    local = {"status": "success", "revision": MANIFEST['revision'],
             "prompt_version": MANIFEST['prompt_version'], "output_token": category,
             "input_sha256": browser_input_hash(report, DEVICES[device_id][3], False),
             "support": {"status": "success", "version": context['version'],
                         "input_sha256": context['input_sha256'], "output_token": token}}
    response = client.post('/api/intelligent-support/analyze-fault', json={**request, 'browser_llm': local})
    assert response.status_code == 200, response.text
    return response.json(), context


@pytest.mark.parametrize('device_id,report,category,reference_id', [
    (901, 'BATTARY LOW', 'A', 'HAM-C6-001'),
    (901, 'Low oxigen', 'F', 'HAM-C6-013'),
    (901, 'Low pressure', 'F', 'HAM-C6-014'),
    (902, 'Resp LEADS OFF', 'B', 'PH-MX800-013'),
    (902, 'Resp Equip Malf', 'B', 'PH-MX800-014'),
    (902, 'تشويش إشارة التنفس', 'B', 'PH-MX800-015'),
    (903, 'BATERY LOW', 'A', 'BB-PS-002'),
    (903, 'Syring drive blocked', 'D', 'BB-PS-011'),
    (903, 'Standby time expired', 'F', 'BB-PS-016'),
])
def test_three_models_select_only_their_own_references(three_devices, device_id, report, category, reference_id):
    client, db, _ = three_devices
    body, _ = analyze(client, device_id, report, category, reference_id)
    assert body['device'] == DEVICES[device_id][0]
    assert body['reference_found'] and body['recommended_solution']
    assert body['customer_support']['selected_reference_id'] == reference_id
    assert body['llm']['prompt_version'] == MANIFEST['prompt_version']
    audit = db.get(AuditLog, body['audit_log_id'])
    assert report in audit.original_input


@pytest.mark.parametrize('device_id', DEVICES)
def test_missing_reference_keeps_device_and_displays_questions(three_devices, device_id):
    client, _, _ = three_devices
    body, context = analyze(client, device_id, 'The enclosure hinge is broken', 'D')
    assert not context['candidates']
    assert body['device'] == DEVICES[device_id][0]
    assert body['customer_support']['reference_status'] == 'NO_MATCHING_REFERENCE'
    assert len(body['customer_support']['questions']) >= 4
    assert not body['recommended_solution'] and not body['reference_found']


@pytest.mark.parametrize('category', ['A', 'H'])
def test_mx800_battery_requests_accessory_identity_without_cross_model_repair(three_devices, category):
    client, _, _ = three_devices
    body, context = analyze(client, 902, 'BATTARY LOW', category)
    assert not context['candidates']
    assert not body['reference_found'] and not body['recommended_solution']
    assert 'X2/X3' in ' '.join(body['customer_support']['questions'])
    assert 'No technical reference matches' in body['customer_support']['message']


def test_normalization_does_not_modify_codes_or_negation():
    assert normalize_report_text('BATTARY LOW; no oxigen alarm; E42_BATERY') == 'battery LOW; no oxygen alarm; E42_BATERY'


def test_browser_regressions_use_actual_device_bound_candidates(three_devices):
    _, db, _ = three_devices
    samples = json.loads((Path(__file__).parents[1] / 'frontend/src/llm/deviceRegressionCases.json').read_text(encoding='utf-8'))
    for sample in samples:
        device = db.query(Device).filter_by(model=sample['model']).one()
        request = SimpleNamespace(fault='', description=sample['report_text'], patient_connected=False, customer_expertise='INTERMEDIATE')
        context, _ = prepare_support(request, device, db)
        assert context['candidates'] == sample['candidates']
        if sample['expected_reference']:
            selected = next(c for c in context['candidates'] if c['label'] == sample['expected_support'])
            assert selected['reference_id'] == sample['expected_reference']
