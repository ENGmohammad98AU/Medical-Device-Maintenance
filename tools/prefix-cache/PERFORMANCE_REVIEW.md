# Model preparation and response review

Reviewed on 2026-09-29. Published baseline: `9d1aeb3a7c8eaddb052c92b38119d8d73aaee411`.
Measured prototype: `209f5d15f391cbe45e3f6788921d4cf0290f9bdf`.

The dominant measured delay is browser-side evaluation of static prompts. It is not a server-side Qwen initialization in the published architecture. `render.yaml` selects `AI_MODE=browser`, and `localModel.worker.ts` loads the GGUF model and performs inference inside the browser. API startup and Internet downloads can add separate delays; this experiment does not measure either.

## Evidence

[Completed Linux and Windows comparison](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/actions/runs/36556746512), in [draft PR 25](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/pull/25).

The `static-prefix-windows-evidence` artifact contains `results-win32.json`; `static-prefix-prototype` contains the paired runtime and static state manifests. Windows used four CPU threads, Qwen3-1.7B Q4_K_M, the existing prompts, and the existing inference settings. A new browser process was used for restoration. No live worker survived between runs.

| Windows preparation stage | Published runtime |
| --- | ---: |
| Initialize model after reading local weights | 5.166 s |
| Evaluate classification prefix, 809 tokens | 146.534 s |
| Evaluate reference-selection prefix, 450 tokens | 74.020 s |
| Evaluate scope prefix, 215 tokens | 35.305 s |
| Evaluate guidance prefix, 264 tokens | 43.282 s |
| Total readiness, excluding model transfer | 304.307 s |

Restored readiness was **6.765 s**: 4.581 s initialization and 2.184 s restoration, approximately 45 times faster in this test. The static files total **199,358,464 bytes**. Reading and hashing them from localhost is included; Internet transfer time is not. This is not a promise of seven-second first visits. The approximately 1.1 GB model download is also excluded.

## Findings in the published code

### 1. Static preparation is recalculated for each new worker

`frontend/src/llm/localModel.worker.ts`, initialization: `loadGgufModel()` is always followed by `warmLocalPrompts()`.

`frontend/src/llm/localModelEngine.ts`, `warmLocalPrompts()`: four independent fixed prefixes are evaluated serially. This consumed 299.141 seconds, about 98% of measured readiness. `frontend/src/llm/modelStorage.js` retains model weights, but not the evaluated prompt state. Cached model weights therefore do not remove this computation.

If browser storage is unavailable or has insufficient quota, `modelStorage.js` uses a temporary downloaded Blob. A new worker can then require another approximately 1.1 GB transfer. This is a separate code path to check on the affected device; it was not the cause of the local-file preparation times above.

PR 24 keeps a worker alive across route navigation. It cannot preserve that worker across a page reload, browser closure, logout, or the ten-minute idle disposal in `localModelSession.ts`. The existing 15-minute preparation deadline can leave the user waiting for this genuine CPU work; reducing the deadline would only stop it earlier.

**Measured improvement:** save and restore the native slot state, including KV data and prompt token bookkeeping, for the four static prefixes. No report, generated answer, model weight, reference-selection rule, or generation instruction needs to change.

### 2. Response work uses a shared budget sequentially

`frontend/src/llm/localModel.worker.ts`, report handling: classification completes before reference selection starts; guidance starts after both. All three consume the same 45-second inference budget. `generateGuidance()` reserves 1.5 seconds for returning a structured result before the hard client timeout.

The six restored Windows report cases took 24.869, 28.126, 22.417, 29.566, 37.265 and 43.707 seconds. The final case timed out. Startup restoration did not materially accelerate report inference.

For the Philips MX800 Resp case, classification consumed about 3.51 seconds and reference selection about 10 seconds before generation. The failure is recorded inside **guidance generation**, after its remaining budget expired. These traces do not include partial generation output, so they do not establish whether the final delay was in evidence prefill, decoding, or both. There is no evidence here of an unresolved JavaScript Promise or an infinite loop.

**Candidate improvement, not yet measured:** submit classification and support selection concurrently to the existing four-slot runtime. They do not consume each other's results. The local `analyzeLocally()` helper waits for both tasks to settle, including failures, so a rejected task does not leave an inference request running after completion. Its two unit tests pass, but the worker does not use it. Concurrency can contend for the same CPU and must be measured before claiming a speedup or changing production behavior.

### 3. Reference evidence contributes substantial response prefill

`frontend/src/llm/guidanceModel.ts`, `prompt()`: the variable report precedes the selected reference evidence. That evidence must be evaluated after the report; the static startup prefix does not include it.

In the sourced battery case, the guidance request evaluated 129 additional tokens in 21.632 seconds and decoded its answer in approximately 3.698 seconds. Thus shortening only the generated answer would not remove the main cost in that case.

**Possible later improvement:** arrange reusable reference context before variable report text and assess per-reference caching. This changes prompt ordering and would require new output and evidence regression tests. It is not included in the validated startup experiment. Evidence must not be silently truncated to improve a timing number.

### 4. Status reporting obscures the expensive phase

`frontend/src/components/LocalModelProgress.tsx`: the warming message does not distinguish classification, reference, scope, and guidance preparation even though the worker supplies `task`. It also displays GPU acceleration as active during loading once `selectComputeBackend()` has chosen an adapter.

`frontend/src/llm/computeBackend.js`: an available, non-fallback adapter is sufficient to select WebGPU. Adapter availability is not an observation that model loading or GPU execution has completed successfully. `localModel.worker.ts` suppresses native runtime logs and requests a CPU retry before emitting a diagnostic for a GPU failure, which removes useful failure context.

**Diagnostic improvement:** show the actual stage and elapsed time; distinguish the requested backend from a successfully initialized backend; retain a sanitized preparation-failure reason. Do not log report text. The old `powerPreference` warning and a fulfilled Promise alone do not identify the measured bottleneck.

### 5. Preparation storage and compute compatibility need deployment work

The new `staticPrefixState.ts` helper binds reusable state to model, runtime, load options and prompt hashes, verifies byte sizes and SHA-256 before native import, and falls back to normal warmup on corrupt or incompatible data. It writes the manifest only after all static files have been saved, before accepting reports.

The validated package is CPU/four-thread only. The current exact-profile check rejects other thread counts and GPU load options. The application can select one to eight threads, so the package is not yet a universal first-start solution. Cross-backend state compatibility has not been validated. The bundled download attempt currently has a 180-second limit; on a slow or failed connection this can add delay before normal warmup. Transfer and fallback policy need validation before deployment.

Native slot IDs are not warmup phase IDs: the saved slots are guidance, scope, reference, and classification in that order. The local helper was corrected to report generic restoration byte progress instead of assigning incorrect phase names from slot numbers.

## Regression results and limits

- Classification: **38/40 before and after**, with identical category tokens. Existing misses: `sensor_en_01` and `other_ar_01`, both returned `MECHANICAL`.
- Support selection: **6/6 before and after**, with identical outputs.
- Guidance: **5/6 before and after**. All five completed texts matched exactly. The Philips MX800 Resp case timed out in both runs.
- Local frontend validation: 108 unit tests passed and TypeScript checking passed, including eight static-cache tests and two concurrency-helper tests. This does not establish a concurrency speedup or replace production-browser integration testing.

These are synthetic regression cases, not a general guarantee of answer correctness or a clinical validation.

## Publication status and adoption order

The production worker still imports the stock runtime and calls normal warmup. It does not call `prepareStaticPrefixState()` or `analyzeLocally()`. Draft PR 25 is a validated startup experiment; it has not been merged or deployed. The local helper and review additions are not in the published site.

1. Wire the paired, verified runtime and static-state helper into the production worker, with stable asset distribution and compatible-profile fallback.
2. Test that production worker on a first visit, a repeat visit, unavailable storage, slow transfer, and the intended device/backend profile. Report transfer time separately from computation.
3. Measure concurrent classification/reference selection while keeping the model, prompts, evidence, seed and shared budget unchanged. Retain the change only if latency improves without output regressions.
4. Add stage-specific timing and GPU-fallback diagnostics to make any remaining slowdown directly identifiable.
5. Publish only the concrete, tested integration after the required publication approval. Raising a timeout, changing a progress message, or keeping a worker alive cannot by itself remove first-session computation.
