-- Portable conversion history belongs only to inert imported actions. It is not
-- a native invocation receipt and is never consulted for preparation authority.
CREATE TABLE imported_action_conversions (
    action_id INTEGER PRIMARY KEY REFERENCES actions(id) ON DELETE CASCADE,
    import_id TEXT NOT NULL REFERENCES graph_imports(import_id) ON DELETE CASCADE,
    target_layer_id INTEGER NOT NULL REFERENCES layers(id)
);

CREATE TRIGGER imported_action_conversion_shape
BEFORE INSERT ON imported_action_conversions
WHEN NOT EXISTS (
    SELECT 1 FROM actions a JOIN graph_imports i ON i.thread_id=a.thread_id
    JOIN layers l ON l.id=a.target_layer_id AND l.thread_id=i.thread_id
    WHERE a.id=NEW.action_id AND i.import_id=NEW.import_id
      AND a.target_layer_id=NEW.target_layer_id AND a.kind='navigate'
      AND a.relation='expand' AND a.state='accepted'
      AND a.interaction_text IS NULL AND a.response=0
)
BEGIN SELECT RAISE(ABORT, 'invalid_imported_action_conversion'); END;

CREATE TRIGGER imported_action_conversion_no_update
BEFORE UPDATE ON imported_action_conversions
BEGIN SELECT RAISE(ABORT, 'immutable_imported_action_conversion'); END;

-- Cascade removal of the enclosing imported graph remains supported.
CREATE TRIGGER imported_action_conversion_no_delete
BEFORE DELETE ON imported_action_conversions
WHEN EXISTS (SELECT 1 FROM actions WHERE id=OLD.action_id)
BEGIN SELECT RAISE(ABORT, 'immutable_imported_action_conversion'); END;

-- Native client keys are unique within a completion, not a whole portable
-- closure. Imports use portable IDs for storage uniqueness and preserve the
-- original authored keys separately, so compiled packages remain byte-identical.
CREATE TABLE imported_node_client_keys (
    node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    import_id TEXT NOT NULL REFERENCES graph_imports(import_id) ON DELETE CASCADE,
    client_key TEXT NOT NULL
);
CREATE TABLE imported_layer_client_keys (
    layer_id INTEGER PRIMARY KEY REFERENCES layers(id) ON DELETE CASCADE,
    import_id TEXT NOT NULL REFERENCES graph_imports(import_id) ON DELETE CASCADE,
    client_key TEXT NOT NULL
);
CREATE TRIGGER imported_node_key_scope
BEFORE INSERT ON imported_node_client_keys
WHEN NOT EXISTS (
    SELECT 1 FROM nodes n JOIN graph_imports i ON i.thread_id=n.thread_id
    WHERE n.id=NEW.node_id AND i.import_id=NEW.import_id AND n.state='accepted'
)
BEGIN SELECT RAISE(ABORT, 'invalid_imported_node_key'); END;
CREATE TRIGGER imported_layer_key_scope
BEFORE INSERT ON imported_layer_client_keys
WHEN NOT EXISTS (
    SELECT 1 FROM layers l JOIN graph_imports i ON i.thread_id=l.thread_id
    WHERE l.id=NEW.layer_id AND i.import_id=NEW.import_id AND l.state='accepted'
)
BEGIN SELECT RAISE(ABORT, 'invalid_imported_layer_key'); END;
CREATE TRIGGER imported_node_key_no_update
BEFORE UPDATE ON imported_node_client_keys
BEGIN SELECT RAISE(ABORT, 'immutable_imported_node_key'); END;
CREATE TRIGGER imported_layer_key_no_update
BEFORE UPDATE ON imported_layer_client_keys
BEGIN SELECT RAISE(ABORT, 'immutable_imported_layer_key'); END;
CREATE TRIGGER imported_node_key_no_delete
BEFORE DELETE ON imported_node_client_keys
WHEN EXISTS (SELECT 1 FROM nodes WHERE id=OLD.node_id)
BEGIN SELECT RAISE(ABORT, 'immutable_imported_node_key'); END;
CREATE TRIGGER imported_layer_key_no_delete
BEFORE DELETE ON imported_layer_client_keys
WHEN EXISTS (SELECT 1 FROM layers WHERE id=OLD.layer_id)
BEGIN SELECT RAISE(ABORT, 'immutable_imported_layer_key'); END;
