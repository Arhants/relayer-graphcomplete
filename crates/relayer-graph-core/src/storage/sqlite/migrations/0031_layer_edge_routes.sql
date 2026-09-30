-- Agent-authored per-edge routes of a layer's layout, as the JSON array of the
-- layout's edgeRoutes (edge ID, optional shape, ends with sides, waypoints).
-- NULL when the layer has no routes, including every layer written before them.
ALTER TABLE layers ADD COLUMN layout_edge_routes TEXT;
