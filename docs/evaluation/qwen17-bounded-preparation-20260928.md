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
No browser security restriction was bypassed. There is no new Windows, WebGPU,
end-to-end latency or decoded-answer/API-replay result for this patch.

The existing Windows CI now additionally requires at least 38/40 classifications
through the production worker. Preparation failures fail the benchmark promptly.
The generation deadline, reference checks and API replay gates remain intact.
The next step requires the user's permission to push a test branch and run CI.
Deployment to the live site requires separate approval after results are reviewed.
No remote branch or live deployment was changed while preparing this patch.
