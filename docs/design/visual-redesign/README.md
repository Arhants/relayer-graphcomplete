# Visual redesign (2026-09) — design record

These files back [ADR 0013](../../decisions/0013-visual-direction-sticker-cocoa.md). They were produced during a
prototype search on a private claude.ai Design canvas
(<https://claude.ai/artifact/LGjmv6H2PLFhPboze15eyt>: pages *Gen 1*, *Gen 2* and *Palette space*). The chosen direction
is prototype **H · Sticker × Cocoa**.

| File | What it is |
|---|---|
| `design-brief.md` | The Gen-1 design brief: diagnosis of the current UI, invariants, canonical object types and states, sample content, sizing, the four Gen-1 directions and their token tables. Sections 2 and 3 (invariants, state grammar, node families) still apply to H. |
| `brief-addendum-authored-details.md` | Amendment for PRs #500 and #532: agent-authored light/dark Node Details and the agent authoring guidance palette. |
| `gen2-brief.md` | Gen-2 decisions: palette per branch, the top-bar status symbol, collapsed annotations, System appearance, density. |
| `b-structure-spec.md` | H's **structure**: the Gen-1 B "Sticker" builder spec (type, spacing, radii, elevation, component sizes, nodes and edges, layout). Its colour tables are superseded by the H colour spec. |
| `h-colour-spec.md` | H's **colour**: the K8 Cocoa Bubblegum palette mapped onto B's tokens for both themes, node-family colours, agent authoring palette, and computed contrast tables. |
| `palette-sources.md` | Raw colour extraction from the two inspiration accounts (@kanishyamo, @meghatheeng). |
| `palette-space-summary.md` | The 29-palette search space: how palettes were engineered and judged, rankings, clusters. |
| `design-config-plan.md` | **Current plan.** Design types as build-time config files (`designs/<id>.json`, selected with `RELAYER_DESIGN`): schema, build pipeline, prototyping loop, phased plan, verification. Supersedes the runtime-palette parts of `theming-proposal.md`. |
| `theming-proposal.md` | How to build H with selectable palettes: architecture, prototyping loop, phased plan, open product decisions, verification plan (code-grounded at `1409d572`/`7093fece`; re-derive counts on current main). |

Notes:
- The specs mention scratch paths (`<scratchpad>/…`, `gen1/B`, `gen2/H`, `tools/…`). Those were the build
  workspace for the prototypes and no longer exist; the Markdown here is the durable record.
- Items marked **[PD]** are product decisions. Those Vishal made explicitly are recorded in ADR 0013. PRD §10.1 records
  System appearance (planned) and the one-design-per-build rule; the other ADR 0013 product changes are not in the PRD yet.
- Nothing here is implemented. The implementation plan is `design-config-plan.md`; the prototype tooling and token
  sources it builds on are in `sources/` (see `sources/README.md`).
