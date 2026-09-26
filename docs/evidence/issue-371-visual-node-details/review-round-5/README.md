# PR 494 packaging repair

Base: `0636005e75ef447af2da22d7b22592d6453956f8`.

[CI run 36276650194](https://github.com/vishaltandale00/relayer-graphcomplete/actions/runs/36276650194) passed deterministic verification but failed macOS packaging. The bundled Prime dependency closure was `8b9e7c9c151cdb88149ed287d9661e972d42ede04d8d53d496ec7d00be2b7709`, differing from the sealed manifest's `8c86ed5c66b6022559fb9903426fec212a757bd4837eff2f7dafea6fe1f54062`. No unchanged retry or manifest reseal was used.

The repair keeps parsed mount inspection in graph-client, which already owns parse5. Eval consumes that inspection helper. Removing Eval's new direct parser dependency restores package.json and lockfile to the previously passing dependency snapshot. CI must verify the actual ASAR closure; dependency-file equality alone is not package proof.

## Changed seams and checkpoints

- Graph-client exports inspection-only parsed mount matching. Missing/duplicate components or elements and wrong host tags reject; no authoring or acceptance authority is granted.
- Eval's fixture retains its integrity, pinned image, exact parsed host, media type and accepted-action checks through the shared helper. Existing negative cases remain; none were deleted.
- Dependency metadata removes only the extra Eval parser entry. Prime's manifest and packaged integrity checks remain unchanged.

## Verification plan

Run focused graph-client/fixture tests and independent source review, then required `npm run check` and `npm run test:desktop:visual-node-details` (includes build). Require fresh CI including actual macOS ASAR verification before merge. Record results separately; no paid inference or release operation is included.

## Executed evidence

The frozen source passed `npm run check` (2,348 Vitest tests, 3 skipped, plus 2 secret-boundary tests) and `npm run test:desktop:visual-node-details`, including build. The final original/imported screenshot pixels match the inspected round-4 captures. `verification.json` records exact source and manifest hashes. The targeted ASAR diagnostic restored the exact sealed dependency digest, but complete packaged CI remains required. No paid inference or release operation ran.
