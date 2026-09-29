# Populated sidebar overflow

Product authority: PRD ACC-008 (§2 account requirements and §4.1 shell),
SCP-007 (saved navigation), and §3.3 (project-row compose). ADR 0003 requires
Eval to share the production workspace. No product semantics or navigation
identities change.

## Changed seams and checkpoints

- `.sidebar-content`: contains overflowing navigation in a scrollport above the
  footer. Production `renderSidebar()` with 12 chats, 12 projects and 48 project
  threads must support browser wheel input and focus on the last destination.
- Direct flex children: keep their intrinsic height so Chats and Projects cannot
  overlap, and New Thread does not collapse. Header/footer cannot shrink.
- Collapsed `.project-button`: removes space reserved for its hidden compose
  action; the project marker and button fit and receive input inside the rail.
- Shared Settings/Eval containers: Settings retains seven tabs and Back; a long
  Eval list exposes its last named destination. Their controllers are unchanged.

`npm run test:desktop:sidebar-overflow` runs a small, inference-free Electron
layout proof against the actual index.html, styles, sidebar controller and
navigation projection. It replaces app startup with deterministic data, so it
is not proof of account authentication, persistence, or saved-thread activation.
It exercises 1100, 761 and 375 CSS-pixel widths at 640 height in both sidebar
modes, section order, footer hit targets, viewport bounds, real browser wheel
input and focus-driven last-row scrolling. Captures wait for layout and the
collapse-icon transition. Screenshots and measured results are written to
`.relayer/evidence/sidebar-overflow` (or `RELAYER_SIDEBAR_EVIDENCE_DIR`).

The declared `npm run test:desktop:narrow-sidebar` entry point includes this
populated layout proof before the existing production-window journey. The
existing journey covers real handlers, account/settings navigation, responsive
collapse, workspace reflow and project-scoped composer behavior. It remains
separate because a layout fixture cannot certify those integration boundaries.
No tests were removed.

## Reproduction and verification

The original stylesheet reproduced the reported screenshot: Chats and Projects
painted over one another and through the footer, with a squashed New Thread.
The first red run reported `populated sidebar must scroll, got visible`.
Adding only overflow containment still failed `Projects must follow Chats
without overlapping`. Preserving child heights repaired both. The populated
collapsed scenario then caught project-button padding extending beyond the rail.

Local verification status and exact source hashes are recorded in the workspace
results alongside the captures. Full repository check/build and the production
window journey remain required; this README is not itself a pass claim.
