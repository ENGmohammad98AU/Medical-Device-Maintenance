/** Fixed development benchmark for the pinned local Qwen classifier.
 * This is a research-development benchmark, not a clinical validation dataset.
 */
import { env, pipeline } from '@huggingface/transformers';
import { classifyLocally } from '../src/llm/localModelEngine';
import config from '../src/llm/localModelConfig.json';
import cases from '../src/llm/benchmarkCases.json';

type Row = {name:string; report_text:string; device_type:string; patient_connected:boolean; expected:string};
const labels = Object.values(config.categories) as string[];
const path = process.env.LOCAL_MODEL_PATH;
if (path) env.allowRemoteModels = false;

const loadStarted = performance.now();
const generator = await pipeline<'text-generation'>('text-generation', path || config.model, {
  dtype: 'q4',
  device: 'cpu',
  revision: config.revision,
  session_options: {intraOpNumThreads: 2},
});
const loadMs = Math.round(performance.now() - loadStarted);

const rows:{name:string;expected:string;predicted:string;correct:boolean;inference_ms:number}[] = [];
try {
  for (const test of cases as Row[]) {
    const started = performance.now();
    const token = await classifyLocally(generator, test);
    const predicted = config.categories[token];
    rows.push({
      name:test.name,
      expected:test.expected,
      predicted,
      correct:predicted === test.expected,
      inference_ms:Math.round(performance.now() - started),
    });
  }
} finally {
  await generator.dispose();
}

const total = rows.length;
const correct = rows.filter(r => r.correct).length;
const perClass:Record<string,{tp:number;fp:number;fn:number;support:number;precision:number;recall:number;f1:number}> = {};
for (const label of labels) {
  const tp = rows.filter(r => r.expected === label && r.predicted === label).length;
  const fp = rows.filter(r => r.expected !== label && r.predicted === label).length;
  const fn = rows.filter(r => r.expected === label && r.predicted !== label).length;
  const support = rows.filter(r => r.expected === label).length;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  perClass[label] = {tp,fp,fn,support,precision,recall,f1};
}
const macroPrecision = labels.reduce((s,l)=>s+perClass[l].precision,0)/labels.length;
const macroRecall = labels.reduce((s,l)=>s+perClass[l].recall,0)/labels.length;
const macroF1 = labels.reduce((s,l)=>s+perClass[l].f1,0)/labels.length;
const avgInferenceMs = rows.reduce((s,r)=>s+r.inference_ms,0)/rows.length;
const confusion:Record<string,Record<string,number>> = {};
for (const truth of labels) {
  confusion[truth] = {};
  for (const pred of labels) confusion[truth][pred] = rows.filter(r=>r.expected===truth && r.predicted===pred).length;
}
console.log('BENCHMARK_RESULT=' + JSON.stringify({
  model:config.model,
  revision:config.revision,
  dtype:config.dtype,
  runtime:'transformers.js/native-cpu',
  prompt_version:config.prompt_version,
  total,
  correct,
  accuracy:correct/total,
  macro_precision:macroPrecision,
  macro_recall:macroRecall,
  macro_f1:macroF1,
  load_ms:loadMs,
  average_inference_ms:avgInferenceMs,
  per_class:perClass,
  confusion_matrix:confusion,
  errors:rows.filter(r=>!r.correct),
}, null, 2));
if (total !== 40) process.exitCode = 2;
