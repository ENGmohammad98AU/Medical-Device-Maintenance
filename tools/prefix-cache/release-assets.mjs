// Creates a reviewable draft by default. Change publish only after the user's
// publication approval, and point validated_commit at the successful app tests.
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {preparePrefixAssets} from '../../frontend/scripts/prepare-prefix-assets.mjs';

const repository = 'ENGmohammad98AU/Medical-Device-Maintenance';
const control = JSON.parse(await readFile('tools/prefix-cache/release-control.json', 'utf8'));
const lock = JSON.parse(await readFile('frontend/src/llm/staticPrefixBundle.json', 'utf8'));
const tag = 'qwen3-prefix-v1';
if (lock.release_url !== `https://github.com/${repository}/releases/download/${tag}`) throw new Error('Unexpected release destination');
await preparePrefixAssets();
const directory = resolve('frontend/public/llm', lock.id);
const names = ['runtime.js', 'runtime.wasm', 'prefix-manifest.json', 'THIRD_PARTY_NOTICES.txt', ...lock.manifest.slots.map(row => row.file)];
for (const name of names) if (!(await readdir(directory)).includes(name)) throw new Error(`Missing ${name}`);
const notes = [
  'Static browser preparation for the existing Qwen3-1.7B Q4_K_M model.',
  '',
  `Model SHA-256: ${lock.manifest.model_sha256}`,
  `Runtime JavaScript SHA-256: ${lock.manifest.runtime.js_sha256}`,
  `Runtime WASM SHA-256: ${lock.manifest.runtime.wasm_sha256}`,
  `Prefix manifest SHA-256: ${lock.manifest_sha256}`,
  '',
  'Generated from four fixed instruction prefixes with no user report. These files contain native slot state, not an answer catalogue or model weights.',
  'CPU state only; incompatible/GPU/compatibility profiles use normal warmup. Runtime and state files must remain paired.',
  'Static state size: 199,358,464 bytes. First-use transfer time depends on the connection. No seven-second Internet-download guarantee.',
  '',
  'Reproducible build and patch: tools/prefix-cache/ in this repository. Upstream revisions and per-file hashes are recorded in prefix-manifest.json.',
  'Third-party notices accompany the runtime. The existing Qwen model remains downloaded from its pinned model repository.',
].join('\n');
const notesFile = resolve('frontend/benchmark-results/prefix-release-notes.md');
await writeFile(notesFile, notes + '\n');
if (process.argv.includes('--prepare-only')) {
  console.log(JSON.stringify({directory, files: names, publish: false}));
} else {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== repository) throw new Error('Release must run in this repository CI');
  const gh = args => execFileSync('gh', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  if (control.publish === true) {
    if (!/^[a-f0-9]{40}$/.test(control.validated_commit)) throw new Error('Missing validated commit');
    execFileSync('git', ['diff', '--exit-code', control.validated_commit, 'HEAD', '--', 'frontend', 'backend', 'render.yaml',
      'tools/prefix-cache/apply-runtime-patch.mjs', 'tools/prefix-cache/prefix-state.inc', 'tools/prefix-cache/build-runtime.sh', 'tools/prefix-cache/bundle.mjs'], {stdio: 'inherit'});
    const runs = JSON.parse(gh(['api', `repos/${repository}/actions/runs?event=pull_request&head_sha=${control.validated_commit}&per_page=100`])).workflow_runs;
    for (const name of ['Production prefix cache and parallel analysis', 'Clean Install Test']) {
      const latest = runs.filter(run => run.name === name).sort((a, b) => b.id - a.id)[0];
      if (latest?.conclusion !== 'success') throw new Error(`Validated application check is not green: ${name}`);
    }
  }
  const releases = JSON.parse(gh(['api', `repos/${repository}/releases?per_page=100`]));
  let release = releases.find(item => item.tag_name === tag);
  if (release && !release.draft) throw new Error('Published assets are immutable; create a new version instead of overwriting');
  if (!release) {
    gh(['release', 'create', tag, '--repo', repository, '--draft', '--target', '209f5d15f391cbe45e3f6788921d4cf0290f9bdf',
      '--title', 'Qwen3-1.7B browser preparation v1', '--notes-file', notesFile]);
  }
  gh(['release', 'upload', tag, ...names.map(name => resolve(directory, name)), '--repo', repository, '--clobber']);
  if (control.publish === true) gh(['release', 'edit', tag, '--repo', repository, '--draft=false']);
  console.log(gh(['release', 'view', tag, '--repo', repository, '--json', 'url,isDraft,assets']));
}
