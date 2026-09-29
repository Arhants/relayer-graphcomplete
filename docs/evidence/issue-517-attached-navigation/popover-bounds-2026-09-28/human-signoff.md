# Human acceptance — local desktop

On September 28, 2026, parent chat `01a0d9c7-e4af-7112-a0f6-92226b2a4201` relayed the user's explicit acceptance after the refreshed desktop: **"it works i sign off"**. This accepts the popover clipping fix in active app server **59885**. The earlier **"okay woohoo it worked now"** accepts the required attached-node navigate-button flow.

The user confirmed the actual desktop works despite the parent's uniformly dark CUA screenshot captures. Agent native visual capture remains blocked, not passed. Prior failed/indeterminate automated Product/Eval/reopen journey evidence remains unchanged. Human acceptance is a separate evidence category.

Provenance: frozen layout snapshot `c37a7b3d24577349032edeb232859e4aa16523f06f3da25abbdcd9d00831b01d`, built and checked in the isolated checkout; only the two verified renderer files were applied to the live checkout. Their live bytes were reverified when recording this acceptance:

- `desktop/renderer/src/product-workspace/workspace.js`: SHA256 `a516628b2b12b7c5c6b09050e496044848e7f1805172d895e5853639bc8df1a3`
- `desktop/renderer/styles.css`: SHA256 `54175b23827e4f62158f36fb2cced3422171629eec7392f95a528655baba7cfe`

This signoff authorizes recording acceptance only. The live app/profile are preserved. No merge, push, deployment, PR mutation, restart, inference, or further product change was performed.
