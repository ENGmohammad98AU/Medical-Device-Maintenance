# English local-model answers

The maintenance and fault-report workflows accept Arabic or English reports and
return English analysis responses. The local Qwen3-1.7B GGUF model still runs
through wllama on the user's device without a cloud account or API key.

When `generate_guidance` is enabled, the worker classifies the report, selects a
matching reference (or abstains), and generates a short natural-language answer.
Generation is available for both the 39 catalogue faults and other reports. It
is no longer restricted to two numbered inspection commands or prescribed verbs.
The output grammar restricts the script; the model writes the content.

The selected server-owned reference supplies its meaning, possible causes,
immediate safety action, recommended solution, and return-to-service conditions.
Only that selected reference enters the generation prompt. Its identifier and
the complete source context are bound to the current device and report. Source
links and page numbers come from the server, never from generated text. The six
supplementary reference summaries are now English translations of the existing
summaries; their identifiers, source links and catalogue separation are retained.

The explanation is displayed separately from the original reference fields.
`REFERENCE_PROVIDED` means evidence was supplied to the model, not that every
sentence has been independently verified. Without a selected source, the answer
must explicitly express uncertainty and is limited by the prompt to external
observations or clarification. The UI labels it as unverified and shows no
manufacturer citations. A source match score is not model accuracy.

The server rejects stale context, mismatched source identifiers, non-English
scripts, incomplete outputs, leaked private data and detected unsafe procedures.
Patient-connected equipment, emergencies, unclear and out-of-scope requests keep
the existing specialist pathways. These checks do not prove clinical correctness
or prevent every hallucination or prompt injection. Human review remains required;
a generated answer never closes a report or certifies a device for clinical use.

The model is asked for fewer than 65 words, with a 128-token completion limit.
Classification, selection and generation share the existing 45-second inference
budget. A timeout or token cutoff returns an explicit failure, not truncated text.
Preparation and the first model download are separate. Longer free text costs
more inference than a reference-selection token; timing depends on the device.
The shared language instruction is warmed before report submission, and only
evidence field labels are shortened; the full manufacturer sentences are retained.

After updating both backend and frontend, restart the backend, refresh the browser
and prepare the model again. Old prompt versions are rejected. Report-entry
controls retain their existing UI language; analysis text is English.
The deployment check verifies the generation version in both frontend bundles
and the public backend health response before reporting a successful rollout.

Validation commands:

```bash
cd backend
python -m pytest -q
cd ../frontend
npm ci
npm test -- --run
npm run build -- --mode benchmark
npx playwright install chromium
npm run benchmark:prepared -- --generation
```

The generation benchmark uses synthetic development cases for all three devices,
including an Arabic report and selected manufacturer evidence. It checks actual
decoding, English output, relevance, selected source identifier and timing. It is
not an independent factual-accuracy or clinical-safety evaluation. The fixed
40-case classification benchmark is unchanged.

Runtime references: [Qwen3-1.7B model card](https://huggingface.co/Qwen/Qwen3-1.7B)
and [wllama completion API](https://github.ngxson.com/wllama/docs/classes/Wllama.html).
