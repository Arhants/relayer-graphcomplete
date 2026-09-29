-- These rows preserve only portable action-binding identity. They are never
-- response layers, navigation targets, or attachment occurrences.
CREATE TABLE imported_provenance_layers (
    layer_id INTEGER PRIMARY KEY REFERENCES layers(id) ON DELETE CASCADE,
    import_id TEXT NOT NULL REFERENCES graph_imports(import_id) ON DELETE CASCADE
);

-- Repair pre-marker imports, including any invalid target authored before this
-- guard existed. An empty imported provenance layer cannot be an accepted
-- response occurrence; real portable layers contain at least one node.
INSERT INTO imported_provenance_layers(layer_id, import_id)
SELECT l.id, k.import_id FROM layers l
JOIN imported_layer_client_keys k ON k.layer_id=l.id
WHERE EXISTS(SELECT 1 FROM actions a WHERE a.source_layer_id=l.id)
  AND NOT EXISTS(SELECT 1 FROM layer_nodes n WHERE n.layer_id=l.id)
  AND NOT EXISTS(SELECT 1 FROM layer_edges e WHERE e.layer_id=l.id)
  AND NOT EXISTS(SELECT 1 FROM layer_actions a WHERE a.layer_id=l.id);

CREATE TRIGGER imported_provenance_layer_shape
BEFORE INSERT ON imported_provenance_layers
WHEN NOT EXISTS (
    SELECT 1 FROM layers l JOIN graph_imports i ON i.thread_id=l.thread_id
    WHERE l.id=NEW.layer_id AND i.import_id=NEW.import_id AND l.state='accepted'
) OR EXISTS(SELECT 1 FROM actions a WHERE a.target_layer_id=NEW.layer_id)
  OR EXISTS(SELECT 1 FROM layer_nodes n WHERE n.layer_id=NEW.layer_id)
  OR EXISTS(SELECT 1 FROM layer_edges e WHERE e.layer_id=NEW.layer_id)
  OR EXISTS(SELECT 1 FROM layer_actions a WHERE a.layer_id=NEW.layer_id)
BEGIN SELECT RAISE(ABORT, 'invalid_imported_provenance_layer'); END;

CREATE TRIGGER imported_provenance_layer_no_update
BEFORE UPDATE ON imported_provenance_layers
BEGIN SELECT RAISE(ABORT, 'immutable_imported_provenance_layer'); END;
CREATE TRIGGER imported_provenance_layer_no_delete
BEFORE DELETE ON imported_provenance_layers
WHEN EXISTS(SELECT 1 FROM layers WHERE id=OLD.layer_id)
BEGIN SELECT RAISE(ABORT, 'immutable_imported_provenance_layer'); END;

CREATE TRIGGER imported_provenance_target_insert
BEFORE INSERT ON actions
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.target_layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_is_not_target'); END;
CREATE TRIGGER imported_provenance_target_update
BEFORE UPDATE OF target_layer_id ON actions
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.target_layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_is_not_target'); END;

CREATE TRIGGER imported_provenance_no_nodes
BEFORE INSERT ON layer_nodes
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_has_no_topology'); END;
CREATE TRIGGER imported_provenance_no_edges
BEFORE INSERT ON layer_edges
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_has_no_topology'); END;
CREATE TRIGGER imported_provenance_no_actions
BEFORE INSERT ON layer_actions
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_has_no_topology'); END;

CREATE TRIGGER imported_provenance_no_nodes_update
BEFORE UPDATE OF layer_id ON layer_nodes
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_has_no_topology'); END;

CREATE TRIGGER imported_provenance_no_edges_update
BEFORE UPDATE OF layer_id ON layer_edges
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_has_no_topology'); END;

CREATE TRIGGER imported_provenance_no_actions_update
BEFORE UPDATE OF layer_id ON layer_actions
WHEN EXISTS(SELECT 1 FROM imported_provenance_layers p WHERE p.layer_id=NEW.layer_id)
BEGIN SELECT RAISE(ABORT, 'imported_provenance_layer_has_no_topology'); END;
