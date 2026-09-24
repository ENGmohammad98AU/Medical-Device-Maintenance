import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const out = new URL('../public/llm/', import.meta.url);
await mkdir(out, {recursive: true});
await copyFile(new URL('../node_modules/@wllama/wllama/esm/index.js', import.meta.url), new URL('wllama.js', out));
await copyFile(new URL('../node_modules/@wllama/wllama/esm/single-thread/wllama.wasm', import.meta.url), new URL('wllama.wasm', out));
const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const config = await read('./qwen17Candidate.json');
const support = await read('../src/llm/supportModelConfig.json');
const format = (messages, prefix = '') => messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n<think>\n\n</think>\n\n' + prefix;
const cases = (await read('../src/llm/benchmarkCases.json')).map(c => ({...c, labels:Object.keys(config.categories), prompt:format([{role:'system',content:config.system_prompt}, ...config.examples, {role:'user',content:c.report_text.trim()}])}));
const supportCases = (await read('../src/llm/supportSmokeCases.json')).map(c => ({...c,
  labels:c.candidates.length ? [...c.candidates.map(r=>r.label), 'D'] : ['D','E'],
  prompt:format(c.candidates.length ? [{role:'system',content:support.system_prompt}, ...support.examples,
    {role:'user',content:`Device: Medical ventilator\nRequest: ${c.report_text}\nReferences:\n${c.candidates.map(r=>`${r.label}: ${r.symptom}`).join('\n')}`}]
    : [{role:'system',content:support.scope_prompt}, ...support.scope_examples, {role:'user',content:c.report_text}], support.answer_prefix),
}));
await writeFile(new URL('candidate.json', out), JSON.stringify({config,cases,supportCases}));
