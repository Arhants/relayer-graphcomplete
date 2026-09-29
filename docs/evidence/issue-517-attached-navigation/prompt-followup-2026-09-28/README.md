# Attached follow-up prompt correction

Status: focused checks, full check, full build and independent review passed; one bounded live retest pending. No commit, push or PR metadata change is authorized for this follow-up yet. Original manual profile/window/backend are preserved.

## Diagnosis and decision

The natural manual example asked why the sky is blue, then attached its accepted explanation with the annotation "i'm not clear what Rayleigh scattering is" and an empty message. The accepted completion authored a separate explanation but never attempted an action on its attached source. The native prompt contained both the gated permission guidance and the unqualified prohibition "Reused accepted nodes cannot take new actions." Native executed-code evidence establishes no attempted attached mutation, not which instruction caused the model choice.

The user approved a consistency fix and a preference for linking useful related follow-ups from an authorized attached source. This is not a universal linking obligation, permission expansion or node-count policy. The original flat output is not evidence that graph nodes were dropped.

## Changed seams and checkpoints

- AN-007 / shared publication prompt: distinguish immutable identity, semantic content, topology and prior actions from the exact frozen attached-navigation exception; only terminal submission publishes staged additions/replacement.
- AN-007 / Codex basic and layered prompts, plus Claude's shared JS builder: prefer a useful follow-up link on the attached source when authorized, while retaining an ordinary response root and model judgment.
- AN-007 / Prime temporal, action-authoring and visual guidance: remove contradictory blanket prohibitions, require supported client operations, and do not advertise missing Python replacement APIs. No new Prime API or linking strategy is added.

The smallest deterministic boundary is the actual prompt passed to the native Codex and Claude execution adapters, including temporal guidance. Three Codex profiles use attached context; Claude's existing SDK-boundary scenario checks the shared emitted prompt. Existing Prime constructed-prompt scenarios check the authority qualifier and absent unsupported JS replacement instruction. No test is removed; provider-specific execution-boundary tests cover distinct emitted prompts.

The first focused run failed six assertions across the three suites. After changing guidance, an existing draft-preview wording assertion detected a capitalization-only change; its original wording was restored without weakening the assertion. Final focused run:130 tests passed in1.89seconds. PRD readability passed.

Required source-bound handoff: npm run check, npm run build, independent semantic/authority and standards review. No graph runtime, client, renderer, persistence or desktop-control behavior changes; prior source-bound heavy evidence for those seams is retained rather than repeating unrelated UI tests. Any missing mapping uses full check fallback.

The separately authorized live test is one two-root sequence: "why is the sky blue", then attach its original answer with the exact annotation above and empty composer. No explicit link request, forced node count, automatic retry or semantic child is allowed. Use a separate profile, actual Desktop flags, real Codex Basic GPT-5.6-Sol, a hard maximum of two provider acquisitions, and complete supported trace exports. Parent must inspect deterministic/review readiness and runner before inference. Report the actual link outcome, including absence.

The first full check found TS2322 in the new default-profile fixture; its full failure log is retained. The corrected fixture removes configured promptProfile for the default case and retains it for the two named variants, without changing assertions or production code. Independent standards delta review cleared that correction. Focused130 tests passed in1.72seconds; harness-host TypeScript check passed. The complete check then passed:207 JavaScript suites,2683 tests and3 skips; two dedicated secret-boundary tests;43 Python tests; Rust stages, receipt lints and PRD readability. Exact reviewed and tested source identities are recorded in review-assertions.md.

Full npm run build completed successfully after the full check. No executable source changed between verification and runtime rebuild.
