// Serve the pinned WASM runtime from our own origin, including on offline cache
// hits. Model weights are fetched on demand from the pinned public HF revision.
import { mkdir, readdir, copyFile } from 'node:fs/promises';
const source = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url);
const target = new URL('../public/onnx/', import.meta.url);
await mkdir(target, {recursive: true});
for (const name of await readdir(source)) {
  if (/^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(name)) {
    await copyFile(new URL(name, source), new URL(name, target));
  }
}
