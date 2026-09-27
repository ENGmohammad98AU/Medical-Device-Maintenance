"""Generation boundary tests; real token decoding is measured in Chromium CI."""
import json
from pathlib import Path

import pytest
from app.models.audit_log import AuditLog
from app.models.fault_reference_rule import FaultReferenceRule
from app.services.browser_llm_service import MANIFEST, browser_input_hash
from app.services.generated_guidance_service import MANIFEST as GUIDANCE
from test_llm_triage import api_client
from test_device_support_regressions import three_devices, DEVICES

TEXT = "1. افحص العجلة بصريًا بحثًا عن عائق ظاهر.\n2. سجّل موضع التعليق وحالة الفرامل الظاهرة."
CASES = json.loads((Path(__file__).parents[1] / 'frontend/src/llm/guidanceCases.json').read_text(encoding="utf-8"))


def prepare(client, device_id=901, text=CASES[0]['report_text'], **changes):
    request = dict(device_id=device_id, description=text, generate_guidance=True, **changes)
    response = client.post('/api/intelligent-support/prepare-support', json=request)
    assert response.status_code == 200, response.text
    return request, response.json()


def local(request, context, **changes):
    return dict(status='success', revision=MANIFEST['revision'], prompt_version=MANIFEST['prompt_version'],
                output_token='D', input_sha256=browser_input_hash(request['description'], DEVICES[request['device_id']][3],
                                                                request.get('patient_connected', False)),
                guidance=dict(status='success', version=GUIDANCE['version'], input_sha256=context['guidance']['input_sha256'],
                              text=TEXT, finish_reason='stop', prompt_tokens=220, completion_tokens=42, latency_ms=12000,
                              **changes))


def analyze(client, request, inference):
    response = client.post('/api/intelligent-support/analyze-fault', json={**request, 'browser_llm': inference})
    assert response.status_code == 200, response.text
    return response.json()


def test_generation_manifest_matches_browser():
    assert json.loads((Path(__file__).parents[1] / 'frontend/src/llm/guidanceModelConfig.json').read_text(encoding="utf-8")) == GUIDANCE


@pytest.mark.parametrize('index,device_id', [(0, 901), (1, 902), (2, 903)])
def test_three_devices_can_generate_without_adding_catalogue_rows(three_devices, index, device_id):
    client, db, _ = three_devices
    before = db.query(FaultReferenceRule).count()
    request, context = prepare(client, device_id, CASES[index]['report_text'])
    assert not context['guidance'].get('blocked_reason')
    assert context['guidance']['device_name'] == CASES[index]['device_name']
    assert CASES[index]['device_type'] == DEVICES[device_id][3]
    body = analyze(client, request, local(request, context))
    assert body['generated_guidance']['status'] == 'DRAFT'
    assert body['generated_guidance']['text'] == TEXT
    assert body['customer_support']['status'] == 'GENERATED'
    assert not body['recommended_solution'] and not body['reference_found'] and not body['sources']
    assert db.query(FaultReferenceRule).count() == before == 39
    audit = db.get(AuditLog, body['audit_log_id'])
    assert audit.classification_result['generated_guidance']['origin'] == 'LLM_GENERATED'
    assert audit.generated_response == TEXT and audit.review_status == 'PENDING'


def test_catalogue_keeps_original_reference_path(api_client):
    client, _, _ = api_client
    _, context = prepare(client, text='Battery low warning')
    assert 'guidance' not in context and context['candidates']


@pytest.mark.parametrize('text', ['Low oxygen', 'Resp Leads Off', 'Standby time expired'])
def test_context_only_alarms_use_generation_when_requested(three_devices, text):
    client, _, _ = three_devices
    device_id = {'Low oxygen': 901, 'Resp Leads Off': 902, 'Standby time expired': 903}[text]
    _, context = prepare(client, device_id, text)
    assert 'guidance' in context


@pytest.mark.parametrize('change', [dict(description='The trolley wheel now rattles'), dict(customer_expertise='EXPERT')])
def test_stale_drafts_cannot_be_attached_to_changed_reports(api_client, change):
    client, _, _ = api_client
    request, context = prepare(client)
    body = analyze(client, {**request, **change}, local(request, context))
    assert body['generated_guidance']['error_code'] == 'context_mismatch'
    assert not body['generated_guidance']['text']


def test_patient_and_unclear_guards_suppress_even_forged_complete_text(api_client):
    client, _, _ = api_client
    for connected, token in [(True, 'D'), (False, 'H')]:
        request, context = prepare(client, patient_connected=connected)
        result = local(request, context); result['output_token'] = token
        body = analyze(client, request, result)
        assert body['generated_guidance']['status'] == 'BLOCKED' and not body['generated_guidance']['text']


@pytest.mark.parametrize('text', ['1. افتح الغطاء وأصلح اللوحة.\n2. أعد تشغيل الجهاز.',
                                  '1. Adjust the alarm limit.\n2. Return the device to use.',
                                  '1. افحص العجلة بصريًا.\n2. إذا وجدت تلفًا فلا',
                                  '1. Check the wheel for 磨损.\n2. Inspect the visible axle.',
                                  '1. افحص العجلة بصريًا.\n2. اسأل المريض عن حالة العجلة.'])
def test_dangerous_and_truncated_drafts_are_not_displayed(api_client, text):
    client, _, _ = api_client
    request, context = prepare(client)
    result = local(request, context); result['guidance']['text'] = text
    body = analyze(client, request, result)
    assert body['generated_guidance']['status'] == 'BLOCKED' and not body['generated_guidance']['text']


def test_timeout_is_explicit_and_does_not_fabricate_an_answer(api_client):
    client, _, _ = api_client
    request, context = prepare(client)
    result = local(request, context)
    result['guidance'] = dict(status='error', version=GUIDANCE['version'], input_sha256=context['guidance']['input_sha256'],
                              latency_ms=43000, error_code='timeout')
    body = analyze(client, request, result)
    assert body['generated_guidance']['status'] == 'UNAVAILABLE'
    assert body['generated_guidance']['error_code'] == 'timeout' and not body['generated_guidance']['text']


def test_compatibility_endpoint_passes_generation_and_patient_context(api_client):
    client, _, _ = api_client
    from app.api.fault_reports import router
    client.app.include_router(router)
    request, context = prepare(client, patient_connected=True)
    response = client.post('/api/fault-reports/analyze', json=dict(device_id=901, error_message=request['description'],
                           generate_guidance=True, patient_connected=True, browser_llm=local(request, context)))
    assert response.status_code == 200, response.text
    assert response.json()['generated_guidance']['status'] == 'BLOCKED'


def test_generated_draft_is_preserved_for_review_without_closing_report(api_client):
    from test_full_support_workflow import create_report
    from app.models.fault_report import FaultStatus
    from app.services.fault_resolution_workflow_service import FaultResolutionWorkflowService
    client, db, _ = api_client
    report = create_report(db)
    request, context = prepare(client, report_id=report.id)
    body = analyze(client, request, local(request, context))
    workflow = FaultResolutionWorkflowService(db).get(report.id)
    assert body['generated_guidance']['status'] == 'DRAFT'
    assert workflow.recommended_solution == TEXT
    assert workflow.reference_source == 'LLM_GENERATED_UNVERIFIED'
    assert workflow.selected_reference_id is None and workflow.specialist_decision is None
    assert workflow.outcome == 'PENDING' and report.status == FaultStatus.IN_PROGRESS
    with pytest.raises(ValueError):
        FaultResolutionWorkflowService(db).verify_resolution(report.id, action_taken='Checked wheel',
            verification_result='Rolls freely', outcome='RESOLVED', user_id=1)
