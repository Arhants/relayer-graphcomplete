-- PROV-002: every async provider result is tied to the connection generation it
-- started with. Connect creates generation 1; reconnect completion, sign-out and
-- removal advance it in the same transaction as their own write.
ALTER TABLE model_providers
ADD COLUMN connection_generation INTEGER NOT NULL DEFAULT 1
CHECK (connection_generation >= 1);
