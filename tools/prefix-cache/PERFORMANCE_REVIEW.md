# Model preparation and response review

Reviewed on 2026-09-29. Published baseline: `9d1aeb3a7c8eaddb052c92b38119d8d73aaee411`. Integration evidence: `6db5841dbe743ef532a4dfb46614ee09e4dd0bd4` in [draft PR 25](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/pull/25). The published site has not changed.

## Measured bottleneck and implemented fix

Qwen executes in the browser (`AI_MODE=browser`). The dominant measured preparation cost is evaluation of four fixed instruction prefixes, not server-side Qwen startup. Cached weights do not preserve that evaluated state.

The [original Windows comparison](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/actions/runs/36556746512) measured 304.307 seconds to readiness: 5.166 seconds initialization and 299.141 seconds static prompt evaluation. Restoring the same static native state took 6.765 seconds. These measurements exclude Internet model transfer.

The application now loads a paired, hash-verified runtime, restores compatible static state before accepting reports, and persists it in browser Cache Storage. The model weights, quantization, classification/reference/scope prompts, generation instructions and sampling settings remain unchanged. Persistent state contains only fixed prefixes prepared before user reports, not generated answers.

## Actual application results

[Windows production-worker integration](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/actions/runs/36581312478), four CPU threads, exercised the built application and a persistent browser profile across separate browser processes:

| Scenario | Model initialization plus preparation | Outcome |
| --- | ---: | --- |
| First visit with bundled state | 9.728 s | Four static files restored and saved |
| New browser process | 8.702 s | Saved state; zero model or static-file requests |
| Corrupted saved state and stalled transfer | About 345 s overall | Five-second transfer stall detected; genuine warmup completed and repaired storage |
| New browser after repair | 7.426 s | Saved state restored; zero model or static-file requests |

First-visit overall time was 25.491 seconds, including model transfer from localhost. The approximately 1.1 GB weights and 199,358,464 bytes of static state still need Internet transfer on a real first visit. These results do not promise ten-second first visits or comparable performance on every device.

A one-thread process also restored the same state: 7.907 seconds first initialization/restoration and 7.716 seconds in a new browser. Its original raw-worker test later timed out during guidance; startup portability does not establish successful one-thread generation.

## Response latency and concurrency decision

The six four-thread serial report cases took 25.225, 28.320, 22.842, 29.588, 37.155 and 43.595 seconds. Five answers completed; the Philips MX800 Resp case exhausted the shared budget during generation.

Concurrent classification/reference selection totaled 185.822 seconds versus 186.725 seconds sequentially, an improvement of only 0.48%. Outputs and completion count were unchanged. This fails the predeclared five-percent useful-gain threshold. **Production stays sequential**; concurrency is available only in benchmark builds for reproducibility.

Static restoration accelerates preparation, not the remaining report/evidence prefill and decoding. The battery case in the earlier native trace spent 21.632 seconds evaluating 129 additional tokens, compared with roughly 3.698 seconds decoding. Reducing answer length alone cannot remove that prefill work.

A separate compact dynamic-reference formatting experiment was tested at `b702640`. In the [six-case Windows generation run](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/actions/runs/36585954710), four answers completed; Resp still hit the hard client deadline and the trolley-wheel case timed out during generation. The battery prompt saved only six tokens (400 to 394), while its answer grew by four tokens (13 to 17). The wheel prompt itself was unchanged, so this run does not isolate a formatting-caused regression; observed compute rates also varied. **No reliable improvement was established, and the formatting change was removed. Production retains the original v13 guidance prompt and version.**

## Reliability and diagnostics

- State identity binds the model, paired runtime, context/backend options and exact static prompt hashes. Scheduling thread count is excluded from the CPU state layout identity. GPU/compatibility workers use ordinary warmup.
- Size and SHA-256 checks precede native import; restored token counts are checked. A manifest is written only after all static slots are saved. Storage failure leaves a successfully prepared model usable.
- Bundle transfer has a five-second no-progress watchdog and sixty-second total cap. After a three-second sample, a projected over-budget transfer is abandoned. Data-saver and 2G/3G connections skip it.
- The UI distinguishes download, model initialization, state restoration, each of four preparation phases, saving, classification, reference selection and generation. It displays elapsed stage/operation time and sanitized CPU-fallback reasons.
- Adapter availability is not represented as proof of completed GPU initialization. Reports are not logged by the production diagnostics.
- Existing hard client deadlines remain. Tests now record client-enforced termination when a stopped worker cannot post a result, without counting that failure as a completed answer.

## Regression results and remaining gates

For the completed four-thread integration at `6db5841`:

- Classification: **38/40**, all category tokens identical to the published baseline. Existing misses remain `sensor_en_01` and `other_ar_01` (both MECHANICAL).
- Reference selection: **6/6**, unchanged outputs.
- Guidance: **5/6**; all five completed texts identical between sequential and concurrent runs. Resp timed out in both.
- Corruption, stalled transfer, repaired persistence and new-browser reuse passed.
- Local candidate validation: **110 frontend unit tests**, TypeScript checking and application build passed.

The integration harness now uses the actual UI/client to measure one-thread deadlines. Dataset hashing normalizes Git's Windows CRLF checkout to LF while preserving all forty cases and expected outputs. The earlier hash mismatch was a test representation error, not an inference result.

Clean-install/generation tests now receive the same verified runtime/state package as the proposed production build. The all-six-generated-answers check remains strict and is not green; timeouts are not reclassified as success. Real-browser candidate results and publication readiness must be read from the latest PR checks. Synthetic regression tests are not a general guarantee of answer correctness or clinical validation.

## Review and publication

The application changes are on a test branch only. Versioned runtime/state assets are prepared as a draft release with checksums and third-party notices. Production builds require the bundle and fail explicitly if it is unavailable; developer builds may use upstream warmup with a warning.

Public assets must be released before the application is merged so Render can retrieve them. Publication requires user approval and matching successful validation; no merge or deployment has been performed. The generation timeout remains a separate limitation until a tested candidate resolves it.
