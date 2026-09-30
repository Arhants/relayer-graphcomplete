-- The agent-chosen edge shape of a layer's authored layout. NULL on layers
-- written before edge shapes existed; readers treat NULL as "default".
ALTER TABLE layers ADD COLUMN layout_edge_shape TEXT;
