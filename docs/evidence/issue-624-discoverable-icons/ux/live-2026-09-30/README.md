# Live marine agent demonstration

On explicit user authorization, one real Codex Basic / GPT-5.6-Sol subscription-backed execution completed in about nine minutes against implementation commit `7aecc95bf0d721e03d27e750e934cb61152fd110`. The model chose the graph and icons; no fixture graph, fixed layout or icon count was supplied. Licensed photographs were available as optional inputs.

The agent used six discovery calls, registered five photographs, inspected individual images and a contact sheet, then submitted an accepted graph with twelve nodes across three layers. Its seven-node overview covers every requested subject. It chose explicit circle/cover photo icons for organisms, network for the ecosystem, and binoculars for monitoring. Static Details contain photographs and explanations; two symbol actions open pathways and image credits.

The six initial queries (`coral reef`, `jellyfish`, `octopus`, `sea turtle`, `plankton microscope`, `reef monitoring`) all returned empty results. Current text retrieval requires every query token; compound wording can miss available `turtle`, `microscope` and `binoculars` symbols. The agent subsequently used familiar symbols through ordinary authoring. Its statement about no marine candidates describes those query results, not absence from the full catalog. This run exposes a retrieval limitation rather than proving discovery coverage.

The complete 461-event trace records real command execution, native image views and successful graph submission. One provider acquisition and one execution-access lease occurred. Source and native hashes remained unchanged; cleanup passed. There was no automatic rerun and no graph acceptance repair. Dollar charges were not measured: this used the existing subscription login, rather than an API billing route.

## Human review

Inspect [the light overview](graph-overview-light.png), [dark overview](graph-overview-dark.png), [overview Details](light-node-1.png), [Coral Details](light-node-2.png), and [dark Jellyfish Details](dark-node-4.png). These are production renderer screenshots from a zero-inference replay of the actual accepted export. All five image icons and seven root Details loaded in both themes; accepted icon pins survived import.

The root spokes mean membership in the reef system, not guaranteed direct interaction. Plankton is a broad category represented by one diatom photograph; the turtle photo represents one species. Small octopus recognition still relies on label and preview. Independent semantic review found no unresolved findings within this single example. This demonstrates exercised model selection with supplied inputs; it does not establish broad selection quality, autonomous online image sourcing or label-independent recognition.

[receipt.json](receipt.json) records exact runtime/source/trace/review identities and screenshot hashes. The full trace, export and ignored operator drivers remain locally under `.relayer/live/issue-624-marine/live-2026-09-30T15-02-06.488Z-9ee900f4` and `.relayer/operator/`. Two replay driver failures (missing bootstrap configuration and pending image URL inspection) remain preserved; both were diagnosed before repair, with no production edit or extra inference. The original deterministic fixture evidence remains historical and separate.
