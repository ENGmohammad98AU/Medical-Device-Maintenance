import {createHash} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, readFile, stat, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const config = JSON.parse(await readFile('frontend/src/llm/localModelConfig.json', 'utf8'));
const file = resolve('.cache/models', config.model_file);
await mkdir(resolve('.cache/models'), {recursive: true});
try {await stat(file);} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(`https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`);
  if (!response.ok || !response.body) throw new Error(`Model HTTP ${response.status}`);
  let bytes = 0;
  const bounded = new Transform({transform(chunk, _, done) {
    bytes += chunk.length;
    done(bytes > config.model_file_bytes ? new Error('Oversized model') : null, chunk);
  }});
  try {await pipeline(Readable.fromWeb(response.body), bounded, createWriteStream(file));}
  catch (error) {await rm(file, {force: true}); throw error;}
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(file)) hash.update(chunk);
if ((await stat(file)).size !== config.model_file_bytes || hash.digest('hex') !== config.model_file_sha256) {
  throw new Error('Model identity does not match the pinned baseline');
}
console.log(`Verified the unchanged ${config.model_file} for both browser runs.`);
