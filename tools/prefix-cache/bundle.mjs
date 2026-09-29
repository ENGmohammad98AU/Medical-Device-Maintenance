import {mkdir, copyFile, writeFile, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const {build} = await import(pathToFileURL(resolve('frontend/node_modules/esbuild/lib/main.js')));
const out = resolve('frontend/benchmark-results/prefix-cache');
await mkdir(out, {recursive: true});
const runtime = process.argv[2] && resolve(process.argv[2]);
if (runtime) {
  execFileSync('node', ['cpp/generate_glue_prototype.js'], {cwd: runtime, stdio: 'inherit'});
  execFileSync('node', ['scripts/build_source_map.js', '--input', 'default:build'], {cwd: runtime, stdio: 'inherit'});
  execFileSync('bash', ['scripts/build_worker.sh'], {cwd: runtime, stdio: 'inherit'});
  await build({entryPoints: [resolve(runtime, 'src/index.ts')], outfile: resolve(out, 'runtime.js'),
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022'});
  await copyFile(resolve(runtime, 'src/wasm/wllama.wasm'), resolve(out, 'runtime.wasm'));
}
await copyFile('frontend/node_modules/@wllama/wllama/esm/index.js', resolve(out, 'stock.js'));
await copyFile('frontend/node_modules/@wllama/wllama/esm/wasm/wllama.wasm', resolve(out, 'stock.wasm'));
await build({entryPoints: ['tools/prefix-cache/browser.ts'], outfile: resolve(out, 'browser.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  define: {'import.meta.env.MODE': '"benchmark"'}});
await writeFile(resolve(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Static prefix benchmark</title><script type="module" src="/browser.js"></script>');
if (runtime) {
  const sha256 = async file => createHash('sha256').update(await readFile(resolve(out, file))).digest('hex');
  await writeFile(resolve(out, 'runtime-manifest.json'), JSON.stringify({
    format: 'mdm-static-prefix-prototype-v1',
    wllama: 'e3972797f9d508887440e9d3fa87dc296f2dec44',
    llama_cpp: '83d855c5a6d70487121edbf4020b25c96b7a04e7',
    js_sha256: await sha256('runtime.js'), wasm_sha256: await sha256('runtime.wasm'),
  }, null, 2));
}
