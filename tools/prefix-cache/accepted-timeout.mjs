import assert from 'node:assert/strict';

// One release decision, after the owner was shown the 11/12 result and asked
// to publish. This does not turn the failed test green or accept other failures.
export function validateAcceptedTimeout(control, run, jobs, log) {
  const accepted = control.accepted_performance_limitation;
  assert.equal(control.validated_commit, '8b0b50f10dca9ed15799401d222735362ea7cff4');
  assert.equal(accepted?.commit, control.validated_commit);
  assert.equal(accepted?.run_id, 36597188654);
  assert.equal(accepted?.job_id, 109505016331);
  assert.equal(accepted?.decision, 'publish_with_disclosed_timeout');
  assert.equal(run?.id, accepted.run_id);
  assert.equal(run?.head_sha, control.validated_commit);
  assert.equal(run?.event, 'pull_request');
  assert.equal(run?.status, 'completed');
  assert.equal(run?.conclusion, 'failure');
  assert.equal(jobs.length, 2);
  const failed = jobs.find(job => job.id === accepted.job_id);
  assert.equal(failed?.name, 'Production worker on Windows (4 threads)');
  assert.equal(failed?.conclusion, 'failure');
  assert.deepEqual(failed.steps.filter(step => step.conclusion === 'failure').map(step => step.name),
    ['Check persistent startup and real inference']);
  const other = jobs.find(job => job.id !== accepted.job_id);
  assert.equal(other?.name, 'Production worker on Windows (1 threads)');
  assert.equal(other?.conclusion, 'success');
  const marker = 'PRODUCTION_GUIDANCE=';
  const rows = log.split('\n').filter(line => line.includes(marker))
    .map(line => JSON.parse(line.slice(line.indexOf(marker) + marker.length)));
  const first = rows.filter(row => row.phase === 'first_guidance');
  const reopened = rows.filter(row => row.phase === 'reopened_guidance');
  assert.equal(rows.length, 12);
  assert.equal(first.length, 6);
  assert.equal(reopened.length, 6);
  assert.equal(new Set(first.map(row => row.name)).size, 6);
  for (let index = 0; index < 11; index++) {
    const row = rows[index];
    assert.equal(row.status, 'success');
    assert.equal(row.support?.status, 'success');
    assert.equal(row.guidance?.status, 'success');
    assert.ok(row.wall_ms < 45_000);
  }
  for (let index = 0; index < 5; index++) {
    assert.equal(reopened[index].name, first[index].name);
    assert.equal(reopened[index].output_token, first[index].output_token);
    assert.equal(reopened[index].support.output_token, first[index].support.output_token);
    assert.equal(reopened[index].guidance.text, first[index].guidance.text);
    assert.equal(reopened[index].guidance.reference_id, first[index].guidance.reference_id);
  }
  assert.equal(first[5].name, 'Philips MX800 sourced Resp answer');
  assert.equal(first[5].guidance.reference_id, 'PH-MX800-013');
  assert.deepEqual(reopened[5], {
    phase: 'reopened_guidance', name: first[5].name, status: 'error',
    error_code: 'timeout', client_timeout: true, wall_ms: 45450,
  });
  return 'Owner-approved release limitation: 11/12 repeated answers completed; reopened Resp timed out at 45.450s. The failed check remains visible.';
}
