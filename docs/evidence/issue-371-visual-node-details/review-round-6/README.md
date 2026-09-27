# PR 494 final asset boundary follow-up

Base: `a55e1c87ee59ec608f6c784a76462913be641788`.

Five later automated findings on the preceding integration snapshot require explicit durability, resource, and portable-export coverage. Implementation and local verification are complete; fresh CI remains required before merge.

## Checkpoint plan

| Seam | Required checkpoint |
| --- | --- |
| Content publication durability | Parent-directory open/sync failure after content rename cannot report an ordinary failed add while publishing a logical asset that duplicates on retry. |
| Shared content memory | Catalog reopen and candidate generation share decoded content for repeated digests while preserving owned bootstrap inputs and public download isolation. |
| Export provenance | Empty, whitespace-only and oversized source filenames produce valid bounded portable metadata without weakening archive validation. |
| Control import validation | Successful and failed isolated validation preserve the durable catalog and do not publish authorization for temporary threads. Normal completion authorization and shared media validation limits remain enforced. |
| Export shared digests | Fetch/encode payload bytes once per digest while validating each accepted node's association metadata, pin and authority. |

Independent review assertions must bind the final source hashes. Required local verification is `npm run check` and `npm run test:desktop:visual-node-details` (includes build); fresh complete CI precedes merge. No paid inference or release operation is included.

## Executed evidence

The frozen source passed `npm run check` (2,350 Vitest tests, 3 skipped, plus 2 secret-boundary tests) and `npm run test:desktop:visual-node-details`, including build. The first full run had one recursive-completion teardown failure after its functional assertions; an isolated three-test diagnostic passed, then one unchanged full rerun passed. The original inner cleanup cause was not captured, and its failure log is retained. No production deadline or assertion was weakened.

Exact hashes, independent reviews, focused results and final proof are recorded separately. Original/imported screenshot pixels match the visually inspected round-4 captures. No paid inference or release operation ran.
