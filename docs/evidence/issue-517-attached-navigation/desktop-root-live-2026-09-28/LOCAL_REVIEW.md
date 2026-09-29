# Isolated local review

The persistent model-authored data is at:
`/Users/vishaltandale/.codex/worktrees/attached-navigation/relayer-graphcomplete/.relayer/attached-navigation-live`

It contains thread 1 with three accepted Codex Basic GPT-5.6-Sol root attempts. The first two used compatibility temporal settings; the third used actual Desktop settings. No recursive children were requested. The older PR536 profile and process were not changed.

From the attached-navigation checkout, open the no-inference Product inspection window:

```sh
cd /Users/vishaltandale/.codex/worktrees/attached-navigation/relayer-graphcomplete
node_modules/.bin/electron .relayer/evidence/attached-navigation-inspect.mjs
```

The launcher opens thread 1 / interaction 1 with a new browser session and actual Desktop temporal flags. It uses the real Product backend and renderer, with every provider acquisition rejected. Closing its window shuts down this inspection backend. Do not run a second process against this profile simultaneously. The durable `inspection-driver.txt` is a copy of the local launcher; its relative imports assume it is placed at `.relayer/evidence/attached-navigation-inspect.mjs` in this checkout.

This is the Product browser fallback, not proof of native Desktop account or keyboard behavior. Local display access is required to see the foreground window. The launcher was syntax checked; automatic capture used a separate driver and verified navigation/reopen with zero provider requests. No human review is implied by the capture.

Select Launch decision. Its four controls should remain: Draft rollout recommendation, Release readiness, Readiness checklist, and Final readiness. Use the two Reference controls, checklist expansion, Back, the interaction graph, and the reused node under Evidence shelf. The old invoke button's label wraps awkwardly; retain that visible caveat during review. Model execution is intentionally unavailable in this launcher.

View `navigation-walkthrough.mp4` and the seven PNG screenshots for the completed zero-inference capture. `visual-receipt.json` and `replay-accepted.json` record exact evidence. The original paid driver is retained solely as historical audit material; the three-call budget is exhausted and it must not be rerun as a review step.

For a full native Desktop launch, the supported development entry uses `RELAYER_DESKTOP_USER_DATA_DIR` and `RELAYER_TEST_INTERACTION_PERMISSIONS=1` with `node_modules/.bin/electron desktop/main/index.mjs`. That path can require real account/provider setup and can enable inference; it was not part of this no-inference inspection proof. Use the launcher above for the authorized replay.
