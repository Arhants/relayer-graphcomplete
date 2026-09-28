# Copied Eval settings links — 2026-09-28

## Reproduction and cause

The real bridge removed the URL fragment after moving the capability into
sessionStorage. A copied address therefore opened Settings without authority in
a fresh browser. The minimized real-bridge/real-gateway test failed with
“Open the authenticated URL printed by Eval” instead of provider status.
This reproduced HTTP 401 while the original authenticated tab succeeded.

## Changed seam and checkpoints

Only browser link bootstrapping changes: keep a supplied authenticated fragment;
restore a missing fragment from the original tab's valid stored capability.
Settings, task, review, and dashboard gateway authority remains unchanged.
No server route returns a capability to an unauthenticated caller. Fragments
stay out of HTTP requests; the existing no-referrer policy remains in force.

Required proof maps to the real bridge/gateway regression and the existing
`npm run test:eval-web` heavy entry point. The regression distinguishes copying
between browsers, upgrading older stripped tabs, and rejecting bare URLs.
The browser scenario copies the actual page URL into a separate storage context,
opens the provider chooser, and verifies the saved default family.

## Actual results

- Before fix: focused regression failed with the expected authorization error.
- After fix: all nine `test/eval-web-host.test.mjs` tests passed.
- `npm run test:eval-web`: all five inner scenarios passed, including the new
  independent-browser copy scenario. No live authentication or inference run.
- PRD readability and diff whitespace checks passed.
- The user's original sign-in tab was left untouched. A fresh Settings link was
  opened from the existing dashboard without restarting its host.
- Direct automated Chrome verification was blocked by Chrome with
  `ERR_BLOCKED_BY_CLIENT`. No protection was disabled or bypassed. This is separate
  from the reproduced app-level 401; direct user-Chrome proof remains unavailable.

No compiled source changed; ADR 0003 requires no rebuild for renderer JavaScript.
The previous full check's three Prime-agent assertion failures remain unresolved.
The earlier full-provider review digest is historical because the bridge and
product documentation changed here. The delta review below is non-certifying
without a PR and does not claim live-provider or release proof.

Reviewer `/root/provider_backend` found no unresolved authority or credential
issues at six-file digest
`ff256af0e12c41d63ac3c070ab84f11ad67736879914bc4d6b186c1136fe06b4`.
Scope: `desktop/eval-renderer/web-bridge.js`, `test/eval-web-host.test.mjs`,
`scripts/test-eval-web.mjs`, PRD, ADR 0003, and the evidence README. Hash format is
sorted relative path + NUL + contents + NUL. This assertion is invalidated by
changes to those files.
