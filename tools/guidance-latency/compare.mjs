import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const baseline = await json('.latency-baseline/frontend/benchmark-results/prepared-generation.json');
const candidate = await json('frontend/benchmark-results/prepared-generation.json');
const cases = await json('frontend/src/llm/guidanceCases.json');
const originalCases = await json('.latency-baseline/frontend/src/llm/guidanceCases.json');
// Inputs, full source evidence, relevance checks and candidate identities stay
// fixed. Only the explicit meaning field is added to the prepared context.
const withoutMeaning = rows => rows.map(row => ({...row, references: row.references.map(({meaning, ...ref}) => ref)}));
assert.deepEqual(withoutMeaning(cases), withoutMeaning(originalCases));
assert.equal(candidate.model_sha256, baseline.model_sha256);
assert.equal(candidate.revision, baseline.revision);
assert.equal(baseline.rows.length, cases.length);
assert.equal(candidate.rows.length, cases.length);
assert.ok(candidate.completed && candidate.rows.every(row => row.correct), 'Every candidate answer must complete and pass the unchanged checks');
for (const file of ['localModelConfig.json', 'localModelEngine.ts', 'localModelContract.ts',
  'supportModelContract.ts', 'supportModelConfig.json', 'ggufChoice.js', 'fastGgufChoice.js']) {
  assert.equal(await readFile('frontend/src/llm/' + file, 'utf8'),
    await readFile('.latency-baseline/frontend/src/llm/' + file, 'utf8'), `Selection code changed: ${file}`);
}
const rows = candidate.rows.map(row => {
  const before = baseline.rows.find(item => item.name === row.name);
  const sample = cases.find(item => item.name === row.name);
  assert.equal(row.report_text, before.report_text);
  // The client kills a timed-out worker, which can leave no selection tokens.
  // Absence is not a changed classification, nor evidence of a matching one.
  const selectionCompared = !before.client_timeout;
  if (selectionCompared) {
    assert.equal(row.output_token, before.output_token, `Classification changed: ${row.name}`);
    assert.equal(row.support.output_token, before.support.output_token, `Reference selection changed: ${row.name}`);
  } else assert.equal(before.error_code, 'timeout');
  return {name: row.name, sourced: !!sample.references.length, before_ms: before.wall_ms, after_ms: row.wall_ms,
    selection_comparison: selectionCompared ? 'MATCH' : 'BASELINE_TIMEOUT_NO_TOKENS',
    before_completed: before.guidance?.status === 'success', after_completed: row.guidance.status === 'success',
    before_prompt_tokens: before.guidance?.prompt_tokens, after_prompt_tokens: row.guidance.prompt_tokens,
    text: row.guidance.text, reference_id: row.guidance.reference_id};
});
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const sourced = rows.filter(row => row.sourced);
const output = {baseline_commit: '55b426fc5238130a56c70644b1794397500660d5',
  model_sha256: candidate.model_sha256, machine: candidate.machine,
  baseline_completed: rows.filter(row => row.before_completed).length,
  candidate_completed: rows.filter(row => row.after_completed).length, cases: rows.length,
  max_after_ms: Math.max(...rows.map(row => row.after_ms)),
  mean_after_ms: Math.round(sum(rows, 'after_ms') / rows.length),
  sourced_before_ms: sum(sourced, 'before_ms'), sourced_after_ms: sum(sourced, 'after_ms'),
  rows, accuracy_note: 'Completion, source binding and rejection checks are measured separately from semantic accuracy. Human review is still required.'};
output.sourced_speedup_percent = Math.round(1000 * (1 - output.sourced_after_ms / output.sourced_before_ms)) / 10;
await writeFile('frontend/benchmark-results/guidance-comparison.json', JSON.stringify(output, null, 2) + '\n');
console.log('GUIDANCE_COMPARISON=' + JSON.stringify(output));
assert.ok(output.sourced_after_ms < output.sourced_before_ms * 0.85, 'A useful sourced-answer improvement of at least 15% was not established');
