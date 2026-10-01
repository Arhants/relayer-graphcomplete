# Individual project collapse

Product authority: PRD §3.3 and SCP-027–030, approved by the owner in the implementation request. Existing SCP-010–017 and ACC-008 remain applicable.

## Required verification plan

| Changed executable seam | Product checkpoint and deterministic observation |
| --- | --- |
| Production project-header rendering and activation | SCP-027: `test/project-sidebar.test.mjs` renders populated and empty project rows, collapses the active chat's list without changing the current chat, and checks expanded state and focus. |
| Renderer preference initialization and desktop preload/IPC/settings update | SCP-028: the focused suite reopens the actual settings store through production IPC from a different renderer origin, verifies stable project IDs, malformed input rejection and preservation of unrelated settings. |
| Project grouping and consolidation identity | SCP-028: survivor IDs retain their own preference; a new survivor does not inherit a retired project's preference. Grouped project IDs determine thread placement. |
| Thread loading, explicit navigation and project composer | SCP-029: `test/workspace-navigation-integration.test.mjs` observes direct load, history, resolved-invoke and graph-source navigation, including failure and supersession. The native project-compose journey exercises real production compose and creation handlers. |
| Hidden thread activity projection and polling | SCP-029: focused rendering and polling exercise approval/failure/running priority without counts or automatic expansion. |
| Sidebar dimension/theme boundary | ACC-008: `test/sidebar.test.mjs` uses generated design tokens with the production stylesheet to check expanded/collapsed widths in both themes. Native narrow-sidebar checks observe actual breakpoint geometry and populated popup containment. The dimension token is `--sidebar-width`; the design color token remains `--sidebar`. |
| Project icon-rail activation and CSS | SCP-030 and ACC-008: focused activation plus native narrow-sidebar and overflow checks observe sidebar expansion, populated layout, keyboard reachability and independent compose. |

Warm edit entry: `npx vitest run test/project-sidebar.test.mjs test/sidebar.test.mjs test/thread-activity-sidebar.test.mjs`.
Required repository gates: `npm run check` and `npm run build`.
Heavy desktop entries: `npm run test:desktop:project-new-thread` and `npm run test:desktop:narrow-sidebar`. Their inner scenario results must be inspected independently of the outer command exit status.

The Mach-O integrity and calibration Git/npm subprocess suites run in the existing sequential Vitest process-bound group. Their assertions and timeout bounds are unchanged. The full portfolio must still execute every selected scenario.

No tests were removed. Header/aggregation fixtures, durable settings reopen, and native journeys protect distinct rendering, persistence, and production-handler boundaries. No paid inference or release-candidate proof applies.

## Cache and evidence limits

This workspace found warm native build outputs in the configured shared `CARGO_TARGET_DIR`; Cargo rebuilt changed checkout units from source. No downloaded runtime or Ladybug artifact was restored or adopted, so no artifact verification failure occurred. The first narrow-sidebar run could not find binaries because its existing fixture uses checkout-local `target/debug` rather than `CARGO_TARGET_DIR`. Linking the ignored checkout target to the configured shared Cargo target repairs that fixture environment; no executable bytes are copied or replaced. Dependencies were installed from the locked npm graph using the existing local npm cache. Fresh tests remain required.

Actual results and an exact-source adversarial review assertion are recorded in the pull request. This document declares the portfolio; it is not itself a passing receipt. Deterministic settings reopen is not proof of a complete Electron process quit/relaunch.

## Working demonstration

Record the real native project journey with:

```sh
RELAYER_PROJECT_SIDEBAR_VIDEO="$PWD/.relayer/evidence/project-sidebar-collapse/demo.mp4" npm run test:desktop:project-new-thread
```

The opt-in helper samples the production Electron window during real project-header and rail clicks, compose, navigation, and restored preference checkpoints. Its captions describe the observed scenario. The native runner remains inference-free; its deterministic provider fixture creates the saved chat. The restart scene recreates renderer/product services and reopens settings while Electron main remains alive. It does not claim a complete Electron quit/relaunch. Default tests do not encode video or add pacing waits.
