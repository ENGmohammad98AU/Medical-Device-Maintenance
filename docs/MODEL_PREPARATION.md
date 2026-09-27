# Model preparation

`browser-preparation-v2-prefix-cache` prepares the same pinned Qwen3-1.7B
Q4_K_M weights using wllama 3.6.1. All four prompt families are ready before
report submission. Warmup evaluates their shared prefixes and discards one
completion token; it no longer evaluates the unused empty-report suffixes.
Report text and generated answers are never part of this preparation cache.

On isolated desktop browsers reporting at least eight logical processors, the
CPU runtime uses up to eight threads while reserving one logical processor for
the application. Smaller and mobile devices retain the four-thread cap. A
browser without shared-memory isolation retains the single-thread fallback.

The existing OPFS weight cache and shared model worker continue to avoid repeat
downloads and preparation during navigation. A full browser reload still needs
in-memory prompt preparation. The initial 1,107,409,472-byte model download is
unchanged, so its duration still depends on the connection and local storage.

The measured comparison is in
[`evaluation/qwen17-preparation-speed-20260927.json`](evaluation/qwen17-preparation-speed-20260927.json).
It uses a SHA-verified local model file, a fresh browser profile per run and the
actual production worker on one Linux desktop. Internet transfer is excluded.
The baseline is main commit `3eea4689a655c82712bb9e8c14b56ab6157f644a` with
four threads; the candidate uses eight. Results describe this machine and these
synthetic cases, not a mobile guarantee or a clinical-accuracy evaluation.

| Measurement | Baseline | Release candidate |
| --- | ---: | ---: |
| Preparation | 172.104 s | 101.894 s |
| Mean report inference, six cases | 18.639 s | 11.655 s |
| Slowest report inference | 21.527 s | 13.806 s |
| Fixed classification result | 38/40 previously measured | 38/40 |

Preparation was 40.8% shorter in this comparison. Two preceding development
probes prepared in approximately 105 seconds on the same machine.

Generation remains English and evidence-bound. During the first performance
probe, the existing server filter rejected a battery replacement instruction.
Guidance v13 explicitly prohibits component replacement to align the prompt
with that rule. The filter is unchanged. CI now replays all six real decoded
answers through the isolated production API, preserving text and selection
tokens and rebinding only the context hashes to the test database.

To reproduce with a locally downloaded copy of the pinned weights:

```bash
cd frontend
npm ci
npm run build -- --mode benchmark
npx playwright install chromium
LLM_MODEL_FILE=/absolute/path/Qwen3-1.7B-Q4_K_M.gguf npm run benchmark:prepared -- --generation --classification
cd ../backend
MDM_GENERATION_BENCHMARK=../frontend/benchmark-results/prepared-generation.json python -m pytest -q test_generation_benchmark.py
```

The optional classification pass uses the unchanged 40-case set and requires
at least the previously measured 38 correct decisions. The shared 45-second
report inference limit and all server content checks remain in force. The
deployment verifier checks the preparation marker as well as matching English
generation versions in both the frontend and backend. Refresh the browser after
deployment to load the new worker; cached model weights can be reused.
