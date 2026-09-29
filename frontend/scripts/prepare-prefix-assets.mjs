import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, readFile, stat, copyFile, rename, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable, Transform} from 'node:stream';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(resolve(root, 'src/llm/staticPrefixBundle.json'), 'utf8'));
const out = resolve(root, 'public/llm', lock.id);
const files = [
  {file: 'runtime.js', sha256: lock.manifest.runtime.js_sha256, limit: 2 * 1024 * 1024},
  {file: 'runtime.wasm', sha256: lock.manifest.runtime.wasm_sha256, limit: 16 * 1024 * 1024},
  {file: 'prefix-manifest.json', sha256: lock.manifest_sha256, limit: 64 * 1024},
  ...lock.manifest.slots.map(row => ({...row, limit: row.bytes})),
];
async function verify(directory) {
  for (const row of files) {
    const file = resolve(directory, row.file);
    const size = (await stat(file)).size;
    if (size > row.limit || (row.bytes && size !== row.bytes)) throw new Error(`Invalid asset size: ${row.file}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest('hex') !== row.sha256) throw new Error(`Invalid asset hash: ${row.file}`);
  }
}
async function notices() {
  const names = ['wllama-LICENCE.txt', 'llama-cpp-LICENSE.txt', 'dawn-LICENSE.txt'];
  const blocks = await Promise.all(names.map(async name => `${name}\n\n${await readFile(resolve(root, 'scripts/prefix-licenses', name), 'utf8')}`));
  const {writeFile} = await import('node:fs/promises');
  await writeFile(resolve(out, 'THIRD_PARTY_NOTICES.txt'), blocks.join('\n\n'));
}

export async function preparePrefixAssets() {
  // A local, verified directory supports CI and builds before release approval.
  const source = process.env.MDM_PREFIX_ASSET_DIR && resolve(process.env.MDM_PREFIX_ASSET_DIR);
  const required = process.env.MDM_REQUIRE_PREFIX_ASSETS === '1' || !!source;
  try {await verify(out); await notices(); console.log(`Verified static preparation assets: ${lock.id}`); return;}
  catch {await rm(out, {recursive: true, force: true});}
  const temporary = out + '.partial';
  await rm(temporary, {recursive: true, force: true});
  await mkdir(temporary, {recursive: true});
  try {
    if (source) {
      await verify(source);
      for (const row of files) await copyFile(resolve(source, row.file), resolve(temporary, row.file));
    } else {
      // Small manifest first: an unpublished release fails promptly, before any
      // large transfer. Only files pinned in the repository lock may be copied.
      const ordered = [files[2], ...files.filter((_, index) => index !== 2)];
      for (const row of ordered) {
        const response = await fetch(`${lock.release_url}/${row.file}`, {signal: AbortSignal.timeout(180_000)});
        if (!response.ok || !response.body) throw new Error(`Static asset HTTP ${response.status}: ${row.file}`);
        let received = 0;
        const bounded = new Transform({transform(chunk, _, done) {
          received += chunk.length;
          done(received > row.limit ? new Error(`Oversized asset: ${row.file}`) : null, chunk);
        }});
        await pipeline(Readable.fromWeb(response.body), bounded, createWriteStream(resolve(temporary, row.file)));
      }
      await verify(temporary);
    }
    await rename(temporary, out);
    await notices();
    console.log(`Prepared verified static assets: ${lock.id}`);
  } catch (error) {
    await rm(temporary, {recursive: true, force: true});
    if (required) throw error;
    console.warn(`Static preparation bundle unavailable; using upstream warmup. ${error.message}`);
  }
}
