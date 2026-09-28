-- No historical backfill: missing descriptions remain on the legacy contract.
CREATE TABLE interaction_permission_config (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    enabled INTEGER NOT NULL CHECK(enabled IN (0,1))
);
INSERT INTO interaction_permission_config VALUES(1,0);
CREATE TABLE interaction_permissions (
    interaction_node_id INTEGER PRIMARY KEY REFERENCES nodes(id),
    description TEXT NOT NULL
);
CREATE TRIGGER interaction_permissions_immutable
BEFORE UPDATE ON interaction_permissions
BEGIN SELECT RAISE(ABORT, 'immutable_interaction_permissions'); END;
-- Graph-owned conversion receipt; never accepted from an action draft.
CREATE TABLE invoke_resolution_transitions (
    action_id INTEGER PRIMARY KEY REFERENCES actions(id),
    interaction_node_id INTEGER NOT NULL UNIQUE REFERENCES nodes(id),
    target_layer_id INTEGER NOT NULL REFERENCES layers(id)
);
