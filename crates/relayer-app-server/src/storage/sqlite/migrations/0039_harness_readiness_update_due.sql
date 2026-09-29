-- An upgrade that changes a coordinated harness's runtime configuration digest leaves its
-- route pending. The app server marks it due for one automatic readiness evaluation, which
-- Desktop runs in the background through the recipe-update trigger. The next committed
-- readiness result for the harness clears the mark, so it runs once per changed digest.
ALTER TABLE product_harnesses
ADD COLUMN readiness_update_due INTEGER NOT NULL DEFAULT 0
CHECK (readiness_update_due IN (0, 1));

-- The exact runtime recipe each coordinated route was last loaded with. An update can
-- change the recipe without changing the digest, whether its staged runtime activates or
-- not. Such a route starts pending and is marked due like a changed digest. '' means none
-- was recorded yet, which marks nothing.
ALTER TABLE product_harnesses
ADD COLUMN runtime_recipe TEXT NOT NULL DEFAULT '';

-- #556: every loaded route startup left pending gets the same one evaluation, including a
-- route an earlier upgrade already left pending. Startup writes harness_readiness_pending for
-- each coordinated route it does not restore; an evaluation records its own reason. Desktop
-- never installs a runtime for the first time for this evaluation.
UPDATE product_harnesses
SET readiness_update_due = 1
WHERE product_visible = 1
  AND available = 0
  AND unavailable_reason_code = 'harness_readiness_pending'
  AND runtime_configuration_digest LIKE 'sha256:%'
  AND runtime_configuration_digest NOT IN ('sha256:not-loaded', 'sha256:unavailable');
