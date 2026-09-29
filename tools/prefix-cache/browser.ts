import {warmLocalPrompts, classifyLocally, selectSupportLocally} from '../../frontend/src/llm/localModelEngine';
import {localModelConfig as config} from '../../frontend/src/llm/localModelContract';
import {supportModelConfig} from '../../frontend/src/llm/supportModelContract';
import {generateGuidance, guidanceModelConfig} from '../../frontend/src/llm/guidanceModel';
import {runtimeLoadOptions} from '../../frontend/src/llm/computeBackend.js';
import classifierCases from '../../frontend/src/llm/benchmarkCases.json';
import supportCases from '../../frontend/src/llm/supportSmokeCases.json';
import guidanceCases from '../../frontend/src/llm/guidanceCases.json';

const options = runtimeLoadOptions(config, 4, 'wasm');
const hash = async (bytes: BufferSource) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
const textHash = (text: string) => hash(new TextEncoder().encode(text));
let model: any;
let measuredModel: any;
let traces: any[] = [];
let phase = '';
async function prefixes() {
  const rows: any[] = [];
  await warmLocalPrompts({createCompletion: async (request: any) => {
    rows.push({phase, sha256: await textHash(request.prompt)});
  }} as any, task => {phase = task;});
  return rows;
}
function instrument() {
  measuredModel = {createCompletion: async (request: any) => {
    const result = await model.createCompletion(request);
    traces.push({phase, usage: result.usage, timings: result.timings});
    return result;
  }};
}
const api = {
  async load(stock = false) {
    const asset = stock ? 'stock' : 'runtime';
    const {Wllama} = await import(/* @vite-ignore */ `/${asset}.js`);
    const fetchStart = performance.now();
    const blob = await (await fetch('/model.gguf')).blob();
    const fetch_ms = Math.round(performance.now() - fetchStart);
    model = new Wllama({default: `/${asset}.wasm`}, {logger: {...console, debug: () => {}}});
    const start = performance.now();
    await model.loadModel([blob], options);
    instrument();
    return {fetch_ms, load_ms: Math.round(performance.now() - start), threads: model.getNumThreads(), options};
  },
  async warm() {
    const start = performance.now();
    const phases: any[] = [];
    traces = [];
    await warmLocalPrompts(measuredModel, task => {
      phase = task;
      phases.push({task, at_ms: Math.round(performance.now() - start)});
      console.log('WARM_STAGE=' + task);
    });
    return {warm_ms: Math.round(performance.now() - start), phases, traces};
  },
  async save() {
    const rows: any[] = [];
    for (let slot = 0; slot < 4; slot++) {
      const start = performance.now();
      const {data, details} = await model.exportPrefixState(slot);
      if (!data || !Number.isInteger(details.n_saved) || details.n_saved < 100) throw new Error('Empty static prefix slot');
      const sha256 = await hash(data);
      const response = await fetch(`/slot-${slot}.bin`, {method: 'PUT', body: data});
      if (!response.ok) throw new Error('Cannot save static prefix');
      rows.push({slot, file: `slot-${slot}.bin`, bytes: data.byteLength, sha256, details,
        export_ms: Math.round(performance.now() - start)});
    }
    return {model_sha256: config.model_file_sha256, options, prefixes: await prefixes(), slots: rows};
  },
  async restore() {
    const start = performance.now();
    const manifest = await (await fetch('/prefix-manifest.json')).json();
    const runtime = await (await fetch('/runtime-manifest.json')).json();
    if (manifest.model_sha256 !== config.model_file_sha256 || JSON.stringify(manifest.options) !== JSON.stringify(options)
      || JSON.stringify(manifest.prefixes) !== JSON.stringify(await prefixes())
      || JSON.stringify(manifest.runtime) !== JSON.stringify(runtime)) throw new Error('Incompatible prefix manifest');
    const rows: any[] = [];
    for (const row of manifest.slots) {
      const at = performance.now();
      const data = new Uint8Array(await (await fetch('/' + row.file)).arrayBuffer());
      if (data.byteLength !== row.bytes || await hash(data) !== row.sha256) throw new Error('Invalid static prefix hash');
      const {details} = await model.importPrefixState(row.slot, data);
      rows.push({slot: row.slot, details, restore_ms: Math.round(performance.now() - at)});
    }
    return {restore_ms: Math.round(performance.now() - start), slots: rows};
  },
  async checks(quick = false) {
    const classification: any[] = [], support: any[] = [], guidance: any[] = [];
    phase = 'classification';
    for (const sample of (quick ? classifierCases.slice(0, 1) : classifierCases)) {
      traces = [];
      const start = performance.now();
      const token = await classifyLocally(measuredModel, sample);
      const row = {name: sample.name, expected: sample.expected, actual: config.categories[token],
        token, latency_ms: Math.round(performance.now() - start), traces};
      classification.push(row);
      console.log('CLASSIFICATION_CASE=' + JSON.stringify(row));
    }
    phase = 'support';
    for (const sample of (quick ? supportCases.slice(0, 3) : supportCases)) {
      traces = [];
      const start = performance.now();
      const token = await selectSupportLocally(measuredModel, {...sample,
        version: supportModelConfig.version, input_sha256: '0'.repeat(64),
        device_name: 'Medical ventilator', candidates: sample.candidates as any});
      const row = {name: sample.name, expected: sample.expected, actual: token,
        latency_ms: Math.round(performance.now() - start), traces};
      support.push(row);
      console.log('SUPPORT_CASE=' + JSON.stringify(row));
    }
    phase = 'generation';
    for (const sample of (quick ? guidanceCases.slice(0, 1) : guidanceCases)) {
      traces = [];
      const start = performance.now();
      const category = await classifyLocally(measuredModel, {...sample, patient_connected: false});
      const token = await selectSupportLocally(measuredModel, {...sample,
        version: supportModelConfig.version, input_sha256: '0'.repeat(64), candidates: sample.candidates as any});
      const reference = sample.candidates.find(candidate => candidate.label === token)?.reference_id;
      if (category === 'H' || token === 'E') throw new Error('Unexpected out-of-scope test case');
      const result = await generateGuidance(measuredModel, {...sample,
        version: guidanceModelConfig.version, input_sha256: '0'.repeat(64)},
      45_000 - (performance.now() - start), reference);
      const row = {name: sample.name, category, support: token, reference, result,
        latency_ms: Math.round(performance.now() - start), traces};
      guidance.push(row);
      console.log('GUIDANCE_CASE=' + JSON.stringify(row));
    }
    return {classification, support, guidance};
  },
};
(window as any).prefixBenchmark = api;
