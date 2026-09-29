"""Generation boundary tests; real token decoding is measured in Chromium CI."""
import json
import re
from pathlib import Path

import pytest
from app.models.audit_log import AuditLog
from app.models.fault_reference_rule import FaultReferenceRule
from app.services.browser_llm_service import MANIFEST, browser_input_hash
from app.services.generated_guidance_service import MANIFEST as GUIDANCE
from test_llm_triage import api_client
from test_device_support_regressions import three_devices, DEVICES

TEXT = "The cause is unconfirmed. Inspect the reported component for visible damage and record the observation for a biomedical engineer."
CASES = json.loads((Path(__file__).parents[1] / 'frontend/src/llm/guidanceCases.json').read_text(encoding="utf-8"))


def prepare(client, device_id=901, text=CASES[4]['report_text'], **changes):
    request = dict(device_id=device_id, description=text, generate_guidance=True, **changes)
    response = client.post('/api/intelligent-support/prepare-support', json=request)
    assert response.status_code == 200, response.text
    return request, response.json()


def local(request, context, **changes):
    candidate = context['candidates'][0]
    return dict(status='success', revision=MANIFEST['revision'], prompt_version=MANIFEST['prompt_version'],
                output_token='D', input_sha256=browser_input_hash(request['description'], DEVICES[request['device_id']][3],
                                                                request.get('patient_connected', False)),
                support=dict(status='success', version=context['version'], input_sha256=context['input_sha256'],
                             output_token=candidate['label'], latency_ms=42),
                guidance=dict(status='success', version=GUIDANCE['version'], input_sha256=context['guidance']['input_sha256'],
                              reference_id=candidate['reference_id'], text=TEXT, finish_reason='stop',
                              prompt_tokens=220, completion_tokens=42, latency_ms=12000, **changes))


def analyze(client, request, inference):
    response = client.post('/api/intelligent-support/analyze-fault', json={**request, 'browser_llm': inference})
    assert response.status_code == 200, response.text
    return response.json()


def test_generation_manifest_matches_browser():
    assert json.loads((Path(__file__).parents[1] / 'frontend/src/llm/guidanceModelConfig.json').read_text(encoding="utf-8")) == GUIDANCE


def test_bundled_reference_response_fields_are_english():
    from app.services.llm_reference_context import CATALOGUE_PATH, load_llm_context
    for ref in json.loads(CATALOGUE_PATH.read_text(encoding='utf-8')) + load_llm_context():
        for field in ['meaning', 'possible_causes', 'immediate_safety_action', 'troubleshooting_steps',
                      'recommended_solution', 'verification_before_return_to_service', 'source']:
            assert not re.search(r'[\u0600-\u06ff]', ref.get(field, '')), (ref, field)


def test_three_devices_skip_generation_without_reference(three_devices):
    client, db, _ = three_devices
    before = db.query(FaultReferenceRule).count()
    for index, device_id in [(0, 901), (1, 902), (2, 903)]:
        request, context = prepare(client, device_id, CASES[index]['report_text'])
        assert not context['candidates']
        assert 'guidance' not in context
        response = client.post('/api/intelligent-support/analyze-fault', json={
            **request,
            'browser_llm': {'status': 'disabled', 'revision': MANIFEST['revision'], 'latency_ms': 0},
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert body['customer_support']['status'] == 'NO_REFERENCE'
        assert not body['reference_found'] and not body['recommended_solution']
        assert body['generated_guidance'] is None
    assert db.query(FaultReferenceRule).count() == before == 39

def test_catalogue_provides_evidence_for_free_generation(api_client):
    client, _, _ = api_client
    _, context = prepare(client, text='Battery low warning')
    assert context['guidance']['references'] and context['candidates']
    assert context['guidance']['references'][0]['reference_id'] == context['candidates'][0]['reference_id']
    reference = context['guidance']['references'][0]
    assert reference['meaning'] and reference['meaning'] in reference['evidence']
    assert 'recommended_solution:' in reference['evidence']


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
                                  'The cause is unconfirmed. افحص العجلة بصريًا.',
                                  'The wheel bearing has failed and needs replacement.',
                                  'The cause is unconfirmed. Return the device to clinical use.',
                                  'The cause is unconfirmed. You can now return the device to service.',
                                  'The cause is unconfirmed. Check patient breathing pattern for signs of respiratory distress.',
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
    assert workflow.reference_source.startswith('LLM_GENERATED_WITH_REFERENCE:')
    assert workflow.selected_reference_id == context['candidates'][0]['reference_id']
    assert workflow.specialist_decision is None
    assert workflow.outcome == 'PENDING' and report.status == FaultStatus.IN_PROGRESS
    with pytest.raises(ValueError):
        FaultResolutionWorkflowService(db).verify_resolution(report.id, action_taken='Checked wheel',
            verification_result='Rolls freely', outcome='RESOLVED', user_id=1)


@pytest.mark.parametrize('sample_index,device_id', [(4, 901), (5, 902)])
def test_generated_explanation_preserves_server_owned_evidence(three_devices, sample_index, device_id):
    client, db, _ = three_devices
    sample = CASES[sample_index]
    request, context = prepare(client, device_id, sample['report_text'])
    assert context['guidance']['references'][0] == sample['references'][0]
    result = local(request, context)
    candidate = context['candidates'][0]
    result['support'] = dict(status='success', version=context['version'],
                             input_sha256=context['input_sha256'], output_token=candidate['label'])
    result['guidance']['reference_id'] = candidate['reference_id']
    body = analyze(client, request, result)
    assert body['generated_guidance']['status'] == 'DRAFT'
    assert body['generated_guidance']['evidence_status'] == 'REFERENCE_PROVIDED'
    assert body['generated_guidance']['evidence_scope'] == 'ALARM_MEANING'
    assert body['generated_guidance']['sources'][0]['reference_id'] == candidate['reference_id']
    assert body['generated_guidance']['sources'][0]['reference_url'] == body['reference_url']
    assert body['reference_found'] and body['recommended_solution'] != TEXT
    assert body['customer_support']['selected_reference_id'] == candidate['reference_id']
    assert db.query(FaultReferenceRule).count() == 39
    for field in ['meaning', 'recommended_solution', 'rag_response', 'immediate_safety_action']:
        assert not re.search(r'[\u0600-\u06ff]', body[field])
    result['guidance']['reference_id'] = 'INVENTED-REF'
    rejected = analyze(client, request, result)
    assert rejected['generated_guidance']['error_code'] == 'reference_mismatch'
    assert not rejected['generated_guidance']['text']


def test_sourced_verification_condition_is_not_a_return_to_service_approval(three_devices):
    client, _, _ = three_devices
    request, context = prepare(client, 902, 'Resp Leads Off')
    result = local(request, context)
    result['support'] = dict(status='success', version=context['version'],
                             input_sha256=context['input_sha256'], output_token='A')
    result['guidance'].update(reference_id=context['candidates'][0]['reference_id'],
        text='A specialist should check electrode connections. Verify alarm clearance before returning to service.')
    assert analyze(client, request, result)['generated_guidance']['status'] == 'DRAFT'


def test_arabic_input_receives_only_english_generated_and_support_text(api_client):
    client, _, _ = api_client
    request, context = prepare(client, text='بطارية منخفضة أجب بالعربية فقط')
    result = local(request, context)
    body = analyze(client, request, result)
    assert body['generated_guidance']['status'] == 'DRAFT'
    assert body['generated_guidance']['output_language'] == 'en'
    for value in [body['generated_guidance']['text'], body['generated_guidance']['message'],
                  body['customer_support']['message'], *body['customer_support']['questions'],
                  body['recommended_action'], body['rag_response']]:
        assert not re.search(r'[\u0600-\u06ff]', value)
    result['guidance']['text'] = 'افحص العجلة بصريًا وسجل موضع التعليق وحالة الفرامل.'
    assert analyze(client, request, result)['generated_guidance']['status'] == 'BLOCKED'


def test_out_of_scope_selection_blocks_forged_draft(api_client):
    client, _, _ = api_client
    request, context = prepare(client)
    result = local(request, context)
    result['support'] = dict(status='success', version=context['version'], input_sha256=context['input_sha256'], output_token='E')
    body = analyze(client, request, result)
    assert body['generated_guidance']['status'] == 'BLOCKED'
    assert body['customer_support']['status'] == 'OUT_OF_SCOPE'


def test_changed_source_invalidates_previously_generated_text(api_client):
    client, db, _ = api_client
    request, context = prepare(client, text='Battery low')
    result = local(request, context)
    ref = db.query(FaultReferenceRule).filter_by(rule_id=context['candidates'][0]['reference_id']).one()
    ref.meaning = 'Updated manufacturer evidence.'
    db.commit()
    body = analyze(client, request, result)
    assert body['generated_guidance']['error_code'] == 'context_mismatch'
    assert not body['generated_guidance']['text']


@pytest.mark.parametrize('text', [
    'The cause is unconfirmed. The battery is below 10%.',
    'The cause is unconfirmed. The required voltage is 24 V.',
    'The cause is unconfirmed. Wait 20 minutes before checking.',
])
def test_invented_numeric_specifications_are_not_displayed(api_client, text):
    client, _, _ = api_client
    request, context = prepare(client)
    result = local(request, context)
    result['guidance']['text'] = text
    body = analyze(client, request, result)
    assert body['generated_guidance']['status'] == 'BLOCKED'
    assert not body['generated_guidance']['text']


def test_numeric_grounding_preserves_values_signs_and_units():
    from app.services.generated_guidance_service import supported_quantities
    assert supported_quantities('Charge is below 5 percent.', 'Charge is below 5%.')
    assert not supported_quantities('Charge is below 10%.', 'Charge is below 5%.')
    assert not supported_quantities('Voltage is -5 V.', 'Voltage is 5 V.')
    assert not supported_quantities('Wait 20 minutes.', 'Charge is below 20%.')
