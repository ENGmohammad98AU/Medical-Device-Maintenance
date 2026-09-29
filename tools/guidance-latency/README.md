# Grounded answer latency comparison

The short sourced answer explains the **complete alarm meaning**. The full
manufacturer safety, repair and verification fields remain in the bound API
context and reference panel. Classification and reference selection still run
through Qwen3-1.7B; weights, sampling, static prefixes and the 45-second request
deadline are unchanged. Contexts lacking an explicit meaning use full evidence.

Client and server reject unsupported numeric quantities. This limited check is
not a semantic accuracy score and does not establish clinical correctness.

`guidance-latency.yml` compares commit
`55b426fc5238130a56c70644b1794397500660d5` and the candidate on one Windows runner
using the same verified model file and cached static prefixes. The six report
texts, original complete evidence, expected classification and reference checks
are fixed. The baseline may record its existing failures; the candidate must
complete all six, preserve selections, pass actual API validation and improve
total sourced-case time by at least 15%. Artifacts contain both timings and
generated answers for review. Completion is reported separately from accuracy.

This comparison neither publishes the application nor relaxes its release gates.
