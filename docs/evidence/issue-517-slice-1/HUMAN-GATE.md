# PR 536 historical deterministic fixture

This fixture is superseded as the final human gate by the [live-model walkthrough](LIVE-GATE.md). Its data and steps remain historical deterministic evidence.

Human acceptance is **pending**. Automated and agent-operated qualification do not
constitute the user's acceptance. This is the production Product renderer and local
services with a deterministic fixture provider, not a signed-release or live-provider test.

Run from the retained worktree:

```sh
cd /Users/vishaltandale/.codex/worktrees/interaction-permissions/relayer-graphcomplete
./node_modules/.bin/electron scripts/run-interaction-permissions-human-gate.mjs --data-dir /Users/vishaltandale/.codex/worktrees/interaction-permissions/relayer-graphcomplete/.relayer/pr536-human-gate
```

The window title is **Relayer PR 536 — Human Review**. The chat is
**PR 536 · Interactive permissions review**. First launch seeds the source with the
feature off, then restarts the same data with typed permissions on. Reopening uses
this same command and never reseeds. Closing the window stops the services and
retains the data. Do not clean the worktree, build, or this directory before acceptance.

1. In Turn 1, select **Results store**. Click **Plan the next improvement** in Node
   Details. Expect a second turn to run and accept using the deterministic provider.
2. Use **Previous turn**. Select **Results store**, then click the same authored
   button. Expect navigation to Turn 2 with the total still **2 turns**.
3. Return to Turn 1. Select **Incoming queue**, then **See queue behavior**.
   This view contains **Waiting tasks**, **Next claim**, and the same persistent
   **Results store** node. Its legacy occurrence originally lacked action membership.
   Select Results store and click its button. Expect navigation to Turn 2, still 2 turns.
4. Close the window and run the same command. Repeat steps 2 and 3. Expect durable
   navigation and no extra execution or turn.
5. In the follow-up box, type a draft and press Shift+Enter. Expect a newline without
   sending. Clear the draft before continuing. The launcher does not block native keys.

The fixture responds quickly, so the running state may be brief. The automated
journey separately holds the invoke to inspect its disabled control; human mode
has no hold file. The source and second occurrence share a node identity, rather
than merely having the same title. Qualification evidence is recorded in
[human-launcher-qualification.json](human-launcher-qualification.json).
