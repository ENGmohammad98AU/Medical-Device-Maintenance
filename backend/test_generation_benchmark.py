"""Replay real browser-decoded answers through the isolated production API.

Run after benchmark:prepared -- --generation with MDM_GENERATION_BENCHMARK
pointing to its JSON output. Only context hashes are rebound to this test DB;
the generated text and classification/reference tokens remain untouched.
"""
import copy
import json
import os
from pathlib import Path

import pytest

from app.services.generated_guidance_service import MANIFEST
from test_llm_triage import api_client
from test_device_support_regressions import three_devices


@pytest.mark.skipif(not os.environ.get('MDM_GENERATION_BENCHMARK'), reason='Requires real browser benchmark output')
def test_decoded_answers_pass_the_production_boundary(three_devices):
    benchmark = json.loads(Path(os.environ['MDM_GENERATION_BENCHMARK']).read_text(encoding='utf-8'))
    assert benchmark.get('completed'), benchmark.get('error')
    assert len(benchmark['rows']) == 6
    client, _, _ = three_devices
    for row in benchmark['rows']:
        device_id = 902 if 'Philips' in row['name'] else 903 if 'Perfusor' in row['name'] else 901
        request = dict(device_id=device_id, description=row['report_text'], generate_guidance=True)
        prepared = client.post('/api/intelligent-support/prepare-support', json=request)
        assert prepared.status_code == 200, prepared.text
        context = prepared.json()
        result = copy.deepcopy({key: row[key] for key in [
            'status', 'revision', 'output_token', 'prompt_version', 'runtime',
            'input_sha256', 'latency_ms', 'guidance', 'support']})
        assert result['guidance']['version'] == MANIFEST['version']
        result['support']['input_sha256'] = context['input_sha256']
        result['guidance']['input_sha256'] = context['guidance']['input_sha256']
        response = client.post('/api/intelligent-support/analyze-fault', json={**request, 'browser_llm': result})
        assert response.status_code == 200, response.text
        resolved = response.json()['generated_guidance']
        assert resolved['status'] == 'DRAFT', (row['name'], resolved)
        assert resolved['text'] == row['guidance']['text']
        assert [source['reference_id'] for source in resolved['sources']] == (
            [row['guidance']['reference_id']] if row['guidance']['reference_id'] else [])
