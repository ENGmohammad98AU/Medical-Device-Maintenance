# Static prefix state experiment

The released Windows tests spend about 5-6 minutes preparing Qwen3-1.7B. Most of that time evaluates the four fixed prefixes. Keeping a worker alive avoids some repetitions but cannot accelerate a new session.

This experiment adds a bounded bridge to the existing llama.cpp slot save/restore operations. A slot file includes its KV state and prompt token bookkeeping. It does not contain a generated answer catalogue. The production model, quantization, prompts, inference parameters, evidence checks, and 45-second inference budget are unchanged.

The application does not use this experimental runtime yet. The GitHub workflow:

1. Builds wllama 3.6.1 and its exact pinned llama.cpp revision, with a small downstream patch.
2. Runs the production warmup functions with no user report and exports the four static slots on Linux.
3. Opens a new browser process, verifies hashes and compatibility, and restores those slots.
4. Compares the published runtime's cold preparation against restoration on Windows, using the same model file and load options.
5. Checks real cached-token counts, all 40 classification cases, six support cases, and six generated answers. Completed generated texts must match the published runtime. Timeouts are recorded separately and cannot be presented as successful answers.

`ready_ms` excludes the model download from localhost. Restoration includes reading and hashing the static files. The manifest reports their full byte sizes; Internet transfer time is not measured. A first visit would need to download those files, and compatible GPU states have not been validated. Both limitations must be resolved or disclosed before production integration.

The current bridge accepts only four slots and bounded state sizes, refuses operations while inference readers are active, uses a fixed internal filename, and removes temporary files on failure and success. It reuses the native state validator. Before production use, the application must bind the cache to the exact model, runtime, load configuration and prefix hashes, handle absent/corrupt/incompatible states by normal warmup, and only save static state before accepting any user report.

Run from the repository root on a normal machine with Docker and browser support:

```sh
cd frontend
npm ci
npx playwright install chromium
cd ..
bash tools/prefix-cache/build-runtime.sh
node tools/prefix-cache/benchmark.mjs --generate --quick
node tools/prefix-cache/benchmark.mjs
```

No model weights or large cache files are committed. Build artifacts and measurements are under `frontend/benchmark-results/prefix-cache/`.
