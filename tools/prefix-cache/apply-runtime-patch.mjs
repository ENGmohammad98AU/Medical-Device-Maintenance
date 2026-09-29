import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(process.argv[2]);
const here = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (pkg.version !== '3.6.1') throw new Error('This patch requires wllama 3.6.1');
async function replace(file, before, after) {
  const path = resolve(root, file);
  const source = await readFile(path, 'utf8');
  if (source.split(before).length !== 2) throw new Error(`Patch anchor changed: ${file}`);
  await writeFile(path, source.replace(before, after));
}

await replace('cpp/glue.hpp', 'struct glue_msg_test_backend_ops_req', `struct glue_msg_prefix_state_req
{
  GLUE_HANDLER("pfxs_req")
  GLUE_FIELD(int, slot)
  GLUE_FIELD(bool, restore)
  GLUE_FIELD(arr_raw, data)
};

struct glue_msg_prefix_state_res
{
  GLUE_HANDLER("pfxs_res")
  GLUE_FIELD(bool, success)
  GLUE_FIELD(str, data_json)
  GLUE_FIELD(arr_raw, data)
};

struct glue_msg_test_backend_ops_req`);
await copyFile(resolve(here, 'prefix-state.inc'), resolve(root, 'cpp/mdm-prefix-state.inc'));
await replace('cpp/wllama-context.h', '  glue_msg_test_backend_ops_res action_test_backend_ops(',
  '#include "mdm-prefix-state.inc"\n\n  glue_msg_test_backend_ops_res action_test_backend_ops(');
await replace('cpp/wllama.cpp', '    WLLAMA_ACTION(test_backend_ops)',
  '    WLLAMA_ACTION(prefix_state)\n    WLLAMA_ACTION(test_backend_ops)');
// Model files use the JS blob reader. Slot files live in MEMFS and must use real fread.
await replace('cpp/wllama-fs.h', '    if (nit == s_file_path_map.end())',
  '    if (nit == s_file_path_map.end() || nit->second.rfind("/tmp/mdm-prefix-", 0) == 0)');
await replace('src/wllama.ts', '  GlueMsgTestBackendOpsRes,',
  '  GlueMsgTestBackendOpsRes,\n  GlueMsgPrefixStateRes,');
await replace('src/wllama.ts', '  async testBackendOps(', `  // Only call while idle, before accepting any report in the application.
  async exportPrefixState(slot: number) {
    return this.prefixState(slot);
  }

  async importPrefixState(slot: number, data: Uint8Array) {
    return this.prefixState(slot, data);
  }

  private async prefixState(slot: number, data?: Uint8Array) {
    this.checkModelLoaded();
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw new Error('Invalid prefix slot');
    if (data && (data.byteLength < 32 || data.byteLength > 256 * 1024 * 1024)) {
      throw new Error('Invalid prefix state size');
    }
    const response = await this.proxy.wllamaAction<GlueMsgPrefixStateRes>('prefix_state', {
      _name: 'pfxs_req', slot, restore: data !== undefined, data: data ? [data] : [],
    });
    const details = JSON.parse(response.data_json);
    if (!response.success) throw new Error('Prefix state failed: ' + response.data_json);
    return {details, data: response.data[0]};
  }

  async testBackendOps(`);
console.log('Applied the bounded slot-state bridge to wllama 3.6.1');
