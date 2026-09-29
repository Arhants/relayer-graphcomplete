# Local review assertions

These are non-certifying local assertions, not PR certification. No PR comment or metadata was changed.

Reviewed source: base `c1db3d10825183c5ab7209b3abd22ef2ef7bbd97`, manifest `source-manifest.json`, digest `e93c25d476f93271cc920dd6bdeae1875b7cc23b9293cc049415b5b0949c6845`. Digest is SHA-256 of UTF-8 compact JSON `{base,files}` using sorted file paths and file-byte SHA-256. The 29 paths include prior prompt-fix evidence; this new evidence directory is outside that source manifest. Any change to a listed path invalidates these assertions.

- Reviewer `/root/required_navigation_authority`: Spec/authority review of V2 preparation, exact terminal target and staged ownership, Advance isolation, authority preservation, compatibility, normalized input delivery, and export/import implications. Verified every manifest file hash. Verdict: no remaining actionable findings. Prior missing model-visible policy finding resolved by canonical read-only input projection. Reviewed three core and 133 prompt-test pass logs. Full-suite and renderer proof were pending, not certified.
- Reviewer `/root/final_boundary_review`: Standards review against the repository instructions, graph ownership, frozen compatibility, tests and domain documentation; delta review of input projection and shared guidance. Verified every manifest file hash. Verdict: no unresolved findings. Prior duplicated prompt contract extracted into one constant. Independently calculated sorted path/NUL/content/NUL digest: `aff2bce6882574bf507fb49f956dc3a174fa53015030ea318b01a0572e63911d`. Static review only; no test execution.
- Parent chat `01a0d9c7-e4af-7112-a0f6-92226b2a4201`: independently recomputed the manifest digest and all 29 file hashes with no mismatches; read the checkpoint map. Awaiting final verification evidence; this is source confirmation, not a completed review/acceptance claim.

## Final test-fixture addenda

Final source manifest: `final-source-manifest.json`, digest `f600ad0cbda6dea61cf49a0d414819b6d6dfabd4af000b24be7898c345e914c4`, 31 paths. Production files are identical to the earlier reviewed `e93c25...` freeze. New paths are the HTTP fixture in graph-server `lib.rs` and the existing desktop first-message runner.

- `/root/required_navigation_authority` verified all 31 hashes at predecessor `234f2b647d53619b411cb3e81e5e8a57f8b34f99196199321e6ee4c7976090da`. Verdict: no actionable Spec/authority findings in HTTP required-target adaptation and the new desktop fixture; implemented checks are not passing visual evidence. The only later source delta is the Eval session partition, separately reviewed below; this assertion does not certify that later delta.
- `/root/final_boundary_review` verified all 31 final hashes. Verdict: no Standards finding; Eval session isolation changes no production code. Independent path/NUL/bytes/NUL digest `eeaec4054574e41cb33d3e73233a8a3139a639e8ee5b673b4e68ef15b7e8c3b2`. No tests run by reviewer.
- `/root/renderer_review` verified all 31 final hashes. Verdict: no remaining concrete mapping defect in separate Eval session, exact canonical layer plus node destination, and consistent Product/Eval/reopen destination IDs. Assembled evidence remains indeterminate; corrected path has not passed. No runs or UI interaction by reviewer.

All assertions remain local and non-certifying; no PR metadata was changed. Evidence additions are outside the source manifest. Any listed-source change invalidates the corresponding assertion.
