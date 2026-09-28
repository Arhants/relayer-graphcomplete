# Authored detail themes — issue #519

The approved contract lets agents author light and dark styling, layout, composition,
and optional asset variants. Relayer selects the active appearance. Its palette is
reference guidance, not a mandatory palette. Meaning and user input survive a switch.
Missing theme styling remains valid and renders the same presentation in both modes.

## Changed seams and required proof

- The public compiler reference advertises `[data-relayer-theme="light"]` and
  `[data-relayer-theme="dark"]`. Existing selector/HTML/resource restrictions remain.
  Public and packaged-client tests exercise compiled submission and host rejection.
- The shared Product/Eval renderer detects the reserved attribute in parsed CSS
  selectors, including nested rules and escapes. Only themed packages receive an
  inner scope. Unthemed DOM ancestry remains unchanged. The host keeps containment.
  Renderer tests cover actual selector detection, legacy compatibility, in-place
  updates, disposal, failed mounting and existing capability boundaries.
- Generic harness guidance reaches Codex, Prime and the shared Claude path.
  Composed prompt tests check delivery; Prime bridge tests compile theme CSS.
- The deterministic fixture contains an explanation, chart, bound control and two
  independently pinned image assets. Integration tests check accepted delivery.
- `npm run test:desktop:node-detail-csp` checks computed light/dark CSS, an escaped
  selector within a media rule, loaded images, and outer containment despite hostile
  important declarations on the inner scope.
- `npm run test:desktop:visual-node-details` checks actual editable Product control
  identity, value, selection, focus and scroll through theme switches. Eval stays
  read-only. Both assets render in the matching theme after reopen and portable
  import. Accepted package bytes remain unchanged. Both modes get painted screenshots.
- `npm run check` and `npm run build` are the required aggregate gates.

No existing test was deleted. The new HappyDOM theme-switch loop in the large
Product selection test was replaced during development by stronger actual-browser
coverage. HappyDOM 20.0.8 holds its forwarding callback weakly and can lose it under
GC pressure; the original Product selection test is unchanged. No production
workaround or retry was added.

## Source and review

Base: `c3d6d6721d065f03532ef233fa13ba2734a760c6`.
Implementation snapshot: `a82902aff97911ea4b43a5980d5dfe0cec1737c2e245c6f325714e9edc3e6f3e`.
The algorithm is sorted path + NUL + bytes + NUL across the 15 changed files listed
in `rendered-evidence.json`, excluding this evidence directory.

Adversarial reviewer `/root/theme_design_review` reviewed that exact snapshot for
scope detection, compiler restrictions, observer lifecycle, input/capability
continuity, generic guidance, persistence, PRD mapping and rendered evidence
assertions. Verdict: no blocking findings; no unresolved implementation issue.
The reviewer did not independently run the renders. This local review is
non-certifying without a PR; it does not substitute for the recorded tests.

The earlier proposal exposed the outer host through `:host()` and was rejected
because authored important declarations could outrank confinement. The final
implementation exposes only an inner scope and retains the existing compiler ban.

## Rendered evidence

`rendered-evidence.json` records the final visual-run assertions, canonical package
integrity, source snapshot and local raw capture locations. Durable selected tiles:

| View | Light | Dark |
| --- | --- | --- |
| Editable Product | [explanation/chart](product-light-1.png), [asset/control](product-light-2.png) | [explanation/chart](product-dark-1.png), [asset/control](product-dark-2.png) |
| Read-only Eval | [explanation/chart](eval-light-1.png), [asset/control](eval-light-2.png) | [explanation/chart](eval-dark-1.png), [asset/control](eval-dark-2.png) |

The main agent inspected the rendered light/dark Product and Eval tiles. Text,
chart labels, images and controls are readable; Product retains entered text and
its selection/focus ring. Eval keeps mutation disabled. Captures are scroll tiles,
so overlapping content and partial content at tile edges are expected.
Representative computed contrast ratios exceed 4.5:1: light body text 13.97:1,
light chart label 5.12:1, light control 12.71:1; dark body text 16.11:1,
dark chart label 11.55:1 and dark control 14.25:1. This is fixture evidence,
not an automatic aesthetic guarantee for arbitrary agent-authored output.

## Execution notes

262 focused tests passed. Both declared rendered entry points passed with zero
paid inference. Their receipts are preserved in `verification.json`.
The final full check passed under Node 22.23.2: Rust formatting/Clippy/default and crash suites, workspace types, 2,487 Vitest tests (3 skipped), 2 secret-boundary tests, 37 Python tests, receipt lint and PRD readability. Both rendered commands rebuilt the same final implementation successfully. Logs and structured results are recorded there separately.

A first full run under ambient Node 26 found a pre-existing exact-port network
permission incompatibility plus this change's stale one-asset fixture expectation.
The fixture expectation now requires two assets. The network test passed unchanged
under the existing Node 22.23.2 runtime, used for the final aggregate run.
An incomplete Electron npm extraction was repaired from the installed version's
cached official archive before successful native proof.

The worktree uses its own npm dependencies and a copy-on-write clone of the warm
Cargo target. A native-cache attempt rejected the ambient generated Ladybug source
tree. A task-local Cargo registry restored the pinned crate bytes; the repository's
Ladybug artifact creator/verifier then validated the native bundle's identity and
hashes. No primary-checkout files or global registry sources were changed.
Caches accelerate compilation only; all reported tests ran freshly.
