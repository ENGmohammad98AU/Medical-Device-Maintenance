import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import {formatQwenMessages as format} from '../src/llm/ggufChoice.js';
const out = new URL('../public/llm/', import.meta.url);
await mkdir(out, {recursive: true});
await copyFile(new URL('../node_modules/@wllama/wllama/esm/index.js', import.meta.url), new URL('wllama.js', out));
await copyFile(new URL('../node_modules/@wllama/wllama/esm/wasm/wllama.wasm', import.meta.url), new URL('wllama-3.6.1.wasm', out));
await copyFile(new URL('../node_modules/wllama-v2/esm/index.js', import.meta.url), new URL('wllama-v2.js', out));
await copyFile(new URL('../node_modules/wllama-v2/esm/single-thread/wllama.wasm', import.meta.url), new URL('wllama-v2.wasm', out));
await copyFile(new URL('../node_modules/wllama-v2/esm/multi-thread/wllama.wasm', import.meta.url), new URL('wllama-v2-multi.wasm', out));
// Keep the former asset URLs for already-open tabs during deployment. New
// workers use the versioned 3.6.1 URL and cannot receive a cached v2 binary.
await copyFile(new URL('wllama-v2.wasm', out), new URL('wllama.wasm', out));
await copyFile(new URL('wllama-v2-multi.wasm', out), new URL('wllama-multi.wasm', out));
await copyFile(new URL('./fixtures/ggufChoice-v2.js', import.meta.url), new URL('choice-v2.js', out));
await copyFile(new URL('./fixtures/ggufConfig-v2.json', import.meta.url), new URL('config-v2.json', out));
await copyFile(new URL('../src/llm/fastGgufChoice.js', import.meta.url), new URL('choice.js', out));
await copyFile(new URL('../src/llm/ggufChoice.js', import.meta.url), new URL('ggufChoice.js', out));
await copyFile(new URL('../src/llm/computeBackend.js', import.meta.url), new URL('computeBackend.js', out));
await copyFile(new URL('../src/llm/browserIsolation.js', import.meta.url), new URL('isolation.js', out));
await copyFile(new URL('../src/llm/modelStorage.js', import.meta.url), new URL('storage.js', out));
const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const config = await read('../src/llm/localModelConfig.json');
const support = await read('../src/llm/supportModelConfig.json');
const cases = (await read('../src/llm/benchmarkCases.json')).map(c => ({...c, labels:Object.keys(config.categories), prompt:format([{role:'system',content:config.system_prompt}, ...config.examples, {role:'user',content:c.report_text.trim()}])}));
const supportCases = (await read('../src/llm/supportSmokeCases.json')).map(c => ({...c,
  labels:c.candidates.length ? [...c.candidates.map(r=>r.label), 'D'] : ['D','E'],
  prompt:format(c.candidates.length ? [{role:'system',content:support.system_prompt}, ...support.examples,
    {role:'user',content:`Device: Medical ventilator\nRequest: ${c.report_text}\nReferences:\n${c.candidates.map(r=>`${r.label}: ${r.symptom}`).join('\n')}`}]
    : [{role:'system',content:support.scope_prompt}, ...support.scope_examples, {role:'user',content:c.report_text}], support.answer_prefix),
}));
await writeFile(new URL('candidate.json', out), JSON.stringify({config,cases,supportCases}));
