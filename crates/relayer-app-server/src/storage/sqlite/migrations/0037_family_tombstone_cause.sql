-- PROV-008: a refresh that finds no eligible execution models tombstones the provider's managed
-- family but keeps it for recovery. Recording that cause lets the family keep the user's enabled
-- choice while tombstoned, and lets a later eligible refresh restore it without re-enabling a
-- family the user disabled. Other tombstones leave the cause NULL.
ALTER TABLE model_families
ADD COLUMN tombstone_cause TEXT
CHECK (tombstone_cause IS NULL OR tombstone_cause = 'no_eligible_models');

-- Families already in that recovery state: the provider's latest managed family, tombstoned
-- while its connected provider reports no eligible models. Earlier builds cleared `enabled` when
-- tombstoning and set it again on restore, so the user's choice is unknown; restore it as enabled,
-- which is what the next eligible refresh did before.
UPDATE model_families
SET tombstone_cause = 'no_eligible_models', enabled = 1
WHERE kind = 'system'
  AND managed_provider_id IS NOT NULL
  AND lifecycle_state = 'tombstoned'
  AND EXISTS (
    SELECT 1 FROM model_providers owner
    WHERE owner.id = model_families.managed_provider_id
      AND owner.lifecycle_state = 'active'
      AND owner.connected = 1
      AND owner.unavailable_reason_code = 'provider_no_eligible_execution_models'
  )
  AND NOT EXISTS (
    SELECT 1 FROM model_families newer
    WHERE newer.managed_provider_id = model_families.managed_provider_id
      AND newer.id > model_families.id
  );
