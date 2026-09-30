-- Completion-local presentation metadata; only accepted output exposes it.
CREATE TABLE thread_icon_proposals (
    interaction_node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    icon TEXT NOT NULL
);
