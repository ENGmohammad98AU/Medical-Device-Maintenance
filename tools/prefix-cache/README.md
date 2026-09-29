# Persistent static preparation

The released Windows tests spend about 5-6 minutes preparing Qwen3-1.7B. Most of that time evaluates the four fixed prefixes. Keeping a worker alive avoids some repetitions but cannot accelerate a new session.

This experiment adds a bounded bridge to the existing llama.cpp slot save/restore operations. A slot file includes its KV state and prompt token bookkeeping. It does not contain a generated answer catalogue. The production model, quantization, fixed instructions, inference parameters, evidence checks, and 45-second inference budget are unchanged. A separately versioned candidate compacts dynamic reference JSON without removing evidence; its response effects require the generation checks.

The draft application now loads the verified paired runtime and calls `prepareStaticPrefixState()` before accepting reports. The currently published site is unchanged. The native benchmark workflow:

1. Builds wllama 3.6.1 and its exact pinned llama.cpp revision, with a small downstream patch.
2. Runs the production warmup functions with no user report and exports the four static slots on Linux.
3. Opens a new browser process, verifies hashes and compatibility, and restores those slots.
4. Compares the published runtime's cold preparation against restoration on Windows, using the same model file and load options.
5. Checks real cached-token counts, all 40 classification cases, six support cases, and six generated answers. Completed generated texts must match the published runtime. Timeouts are recorded separately and cannot be presented as successful answers.

`ready_ms` excludes the model download from localhost. Restoration includes reading and hashing the static files. The manifest reports their full byte sizes; Internet transfer time is not measured. A first visit would need to download those files, and compatible GPU states have not been validated. Both limitations must be resolved or disclosed before production integration.

The bridge accepts only four slots and bounded state sizes, refuses operations while inference readers are active, uses a fixed internal filename, and removes temporary files on failure and success. The application binds state to the exact model, runtime, context/backend settings and prompt hashes, verifies sizes and SHA-256 before import, and writes the local manifest last. CPU scheduling thread count is excluded from the layout identity; one/four-thread behavior is checked by the production integration workflow. GPU and upstream compatibility workers use normal warmup.

The worker prefers Cache Storage, then compatible bundled CPU state. Transfers have a five-second no-progress watchdog and a sixty-second total cap. After a three-second throughput sample, a transfer projected to exceed the cap is aborted. Data-saver and 2G/3G connections skip the extra transfer. Failed or incompatible state uses real warmup and, when storage permits, saves the resulting static prefixes before any report is accepted. No report or generated answer is saved in this persistent cache.

## Production integration test

`prefix-integration.yml` builds the actual application with verified assets and tests Windows with one and four CPU threads. It opens a fresh browser process against the same profile to prove persistence, compares serial/concurrent report analysis (production remains serial after the measured gain was below 1%), checks the original forty classifier outputs and six support cases, and exercises corrupted state plus stalled transfer recovery. `benchmark-baseline.json` records the earlier classifier outputs and the LF-normalized source dataset hash; test inputs and expected categories are unchanged. Latency and correctness are evaluated separately. The one-thread guidance test records hardware timeouts and checks the actual UI/client deadline; it does not promise successful generation on that slower profile.

## Assets and publication

`frontend/src/llm/staticPrefixBundle.json` pins the runtime, state hashes and release URL. `prepare-prefix-assets.mjs` verifies every byte file before placing it under a versioned public directory. A local/CI build may supply `MDM_PREFIX_ASSET_DIR`; Render requires `MDM_REQUIRE_PREFIX_ASSETS=1` so missing production assets fail the build explicitly. Developer builds without a bundle use upstream warmup and print a warning.

`prefix-assets.yml` prepares a **draft** release with the verified runtime, static files and third-party notices. `release-control.json` defaults to `publish: false`. Publication requires explicit user approval before changing that flag. The publication script also verifies that frontend/backend/runtime code matches the validated commit and that its production-integration and clean-install workflows passed. Released assets are immutable. Publish the assets before merging the application change so Render can download them during its build.

Production builds use stable release URLs. CI prefers the versioned release (including the authenticated review draft); the original artifact is only a bootstrap source before that release exists. Model weights are never uploaded into this release.

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
