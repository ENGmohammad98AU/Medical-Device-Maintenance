The local model could spend minutes preparing four prompt caches before the
45-second inference timer started. Preparation previously shared a 15-minute
allowance with the 1.1 GB download. A GPU initialization failure also discarded
the useful error before retrying on the CPU.

This patch separates the phases. Download/file access retains a 15-minute limit;
native loading and all prompt warmups share 120 seconds after the complete model
file is available. Classification, reference selection and generation still share
45 seconds after preparation. Repeated progress and a GPU-to-CPU retry do not
renew an active deadline. Expiry terminates the worker and does not delete cached
model files. These are stopping limits, not promised successful response times.

The UI shows elapsed time, the remaining allowance and the active phase. A CPU
fallback remains visible throughout the retry. Preparation diagnostics are kept
locally, bounded and stripped of resource URLs; report inference does not retain
native logs. Local-only metadata is removed before submitting results to the
strict API schema. Disposing the model session permits a new GPU attempt.

The Qwen3-1.7B Q4_K_M weights, pinned revision, runtime, classifier instructions,
all 19 classifier chat examples, scope prompt, generation prompt, English output
policy and evidence validation are unchanged. Reference selection retains its
original instructions and five of nine example pairs. Its static prefix fell
from 450 to 341 tokens (24.22%). This is a reduction in that prefix's work, not a
measured percentage improvement in end-to-end browser latency.

Validation:

- Frontend: 99 tests passed; TypeScript and the benchmark production build passed.
- Backend: 102 tests passed across browser result validation, customer support,
  generated guidance and device support regressions. Existing deprecation and
  bundle-size warnings remain.
- Same SHA-verified GGUF, native llama.cpp b11236 on CPU: all 6 support cases and
  all 8 device reference-selection cases passed with the compact reference
  prompt in three trials.
- Three classifier compaction experiments scored 32/40, 35/40 and 35/40 versus
  the native baseline's 38/40. They were rejected and the original classifier
  was restored. The native baseline also missed one of eight device categories,
  unlike prior browser results; this is another reason not to equate runtimes.
- The native experiments are development checks, not medical accuracy claims or
  browser speed measurements. Raw rows and limitations are in the adjacent JSON.

New real-browser validation is blocked locally. Chrome aborts before loading the
application because its process-singleton socket is denied (`Operation not
permitted`); the environment's automatic approval policy rejected escalation.
No browser security restriction was bypassed. At that pre-upload checkpoint,
no new Windows, WebGPU or decoded-answer/API-replay result was available; the
subsequent Windows results are recorded below.

The existing Windows CI now additionally requires at least 38/40 classifications
through the production worker. Preparation failures fail the benchmark promptly.
The generation deadline, reference checks and API replay gates remain intact.
The user subsequently authorized the test-branch upload and Windows CI. Draft
[PR #23](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/pull/23)
contains this work. Deployment to the live site still requires separate approval.

Windows run [36483146702](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/actions/runs/36483146702)
passed the backend suite (222 passed, 1 skipped), but model preparation exceeded
120 seconds on the four-thread CPU runner before any generated answer. This
patch is therefore not a verified performance solution for that machine.

The follow-up instrumentation at commit `303418f` preserves incomplete phase
timings instead of reporting zero preparation time on failure. Its Windows
generation run measured 29.986 s for download, 4.371 s for native initialization,
112.759 s for classifier warmup, and 3.369 s in unfinished reference warmup before
the same preparation deadline stopped the worker. Run
[36486136072](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/actions/runs/36486136072)
also compares thread and microbatch settings on identical model bytes and one
Windows host. Timing cutoffs remain failure limits, not successful response-time
claims.

The controlled CPU comparison completed four variants: 4 threads / microbatch
512, 2 / 512, 1 / 512, and 2 / 128. All four failed during classifier warmup at
the shared 120-second preparation limit. These are right-censored observations:
they do not show equal execution speed, and they do not establish which failed
variant is fastest. No CPU thread policy was changed on this evidence.

The follow-up GPU probe uses the same default adapter request as the pinned
llama.cpp WebGPU backend and requires `shader-f16`, just as that backend does.
This prevents an available but incompatible adapter from being advertised as
usable GPU compute. It is a compatibility fix, not a measured GPU speedup.
Pinned implementation: ggml-org/llama.cpp commit
`83d855c5a6d70487121edbf4020b25c96b7a04e7`,
`ggml/src/ggml-webgpu/ggml-webgpu.cpp`, backend registration and adapter selection.
The corresponding unit test and the full frontend suite pass (100 tests).

The CPU attention-kernel follow-up compares the unchanged automatic policy
against disabled Flash Attention, at microbatch 512 and 128. Overrides exist
only in the benchmark build; production resource limits remain fixed. This
experiment cannot count as a successful release gate: all six generation cases,
at least 38/40 development classifications and API answer validation must still
pass before a runtime policy is adopted.
