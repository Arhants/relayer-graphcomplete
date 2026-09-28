ALTER TABLE layers ADD COLUMN default_node_id INTEGER REFERENCES nodes(id);
