# Desktop release authority

These rulesets close the live repository-control assumptions made by the desktop release workflows. They are inert JSON definitions until a repository administrator explicitly imports or applies them.

## Intended controls

`main-ruleset.json` requires every `main` update to come through a pull request, requires the GitHub Actions `check` and `merge-freshness` checks from app ID `15368`, blocks force pushes and deletion, and keeps history linear. Strict up-to-date checking is disabled in favor of the scheduled 12-hour CI evidence guard described in `docs/agents/ci.md`. It requires zero approving reviews because this personal repository currently has one administrator. The administrator still cannot push directly to `main`.

Do not apply the additional required check before the guard workflow is on main,
has produced real checks, and both valid and expired evidence have been verified.
Update the existing ruleset rather than creating a duplicate. The audit checks
configuration, not scheduler health or runtime enforcement.

`desktop-tags-ruleset.json` restricts creation, replacement, and deletion of `desktop-v*` tags to repository administrators. Repository role ID `5` is GitHub's built-in administrator role. The signed-candidate workflow separately rejects a tag unless its version matches `desktop/package.json` and its commit is on `main`.

Do not activate the existing disabled `main` ruleset unchanged. It contains creation and update restrictions with no bypass actor and would prevent ordinary repository updates.

## Read-only audit

Run the repository audit at any time:

```sh
npm run desktop:release:audit-authority
```

The command prints names and policy results only. It never prints secret or variable values and never changes GitHub.

## Apply after explicit approval

From the repository root, preview both payloads before sending them:

```sh
jq . infra/github/desktop-release-authority/main-ruleset.json
jq . infra/github/desktop-release-authority/desktop-tags-ruleset.json
```

For an existing repository, inspect the live ruleset by ID and change only the
approved fields. Do not POST a second main ruleset or replace live settings with
this template: unrelated approval requirements, target conditions, and bypass
settings must remain unchanged. The main rollout adds only the GitHub Actions
`merge-freshness` required context and disables strict freshness; it does not
change the tag ruleset. Use the browser or a reviewed PUT payload derived from
the freshly fetched live ruleset, after the hosted evidence gates above pass.

Creating either ruleset from its whole template is appropriate only for an
explicitly approved initial bootstrap after verifying that no matching ruleset
already exists.

Run the read-only audit after any approved policy update. Do not merge, tag, or
publish merely because the policy audit passes; those remain separate approval
gates.
