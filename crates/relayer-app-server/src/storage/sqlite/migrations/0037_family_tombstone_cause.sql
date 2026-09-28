-- PROV-008: a refresh that finds no eligible execution models tombstones the provider's managed
-- family but keeps it for recovery. Recording that cause lets the family keep the user's enabled
-- choice while tombstoned, and lets a later eligible refresh restore it without re-enabling a
-- family the user disabled. Other tombstones leave the cause NULL.
ALTER TABLE model_families
ADD COLUMN tombstone_cause TEXT
CHECK (tombstone_cause IS NULL OR tombstone_cause = 'no_eligible_models');

-- Families already in that recovery state. A provider's managed families were all tombstoned by
-- a zero-eligible refresh when it has no active managed family left while it is active: policy
-- retirement always leaves a successor active. The kept family is the provider's default when it is
-- one of them, since reconciliation keeps the default on the provider's current family; otherwise
-- the one retired last. Neither the newest id nor the retirement second alone is enough: after a
-- policy revert the superseded family has the higher id, and removed_at has one-second resolution.
-- The provider is connected and still reports no eligible models, or has disconnected since,
-- which overwrote that reason. Earlier builds cleared `enabled` when tombstoning and set it again
-- on restore, so the user's choice is unknown; restore it as enabled, which is what the next
-- eligible refresh did before.
UPDATE model_families
SET tombstone_cause = 'no_eligible_models', enabled = 1
WHERE kind = 'system'
  AND managed_provider_id IS NOT NULL
  AND lifecycle_state = 'tombstoned'
  AND EXISTS (
    SELECT 1 FROM model_providers owner
    WHERE owner.id = model_families.managed_provider_id
      AND owner.lifecycle_state = 'active'
      AND (
        owner.connected = 0
        OR owner.unavailable_reason_code = 'provider_no_eligible_execution_models'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM model_families live
    WHERE live.managed_provider_id = model_families.managed_provider_id
      AND live.lifecycle_state = 'active'
  )
  AND id = (
    SELECT kept.id FROM model_families kept
    WHERE kept.managed_provider_id = model_families.managed_provider_id
      AND kept.lifecycle_state = 'tombstoned'
    ORDER BY
      kept.id = (SELECT default_family_id FROM product_model_preferences WHERE singleton = 1) DESC,
      CAST(kept.removed_at AS INTEGER) DESC,
      kept.id DESC
    LIMIT 1
  );
