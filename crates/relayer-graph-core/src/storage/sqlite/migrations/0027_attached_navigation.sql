CREATE TABLE attached_navigation_actions (
    action_id INTEGER PRIMARY KEY REFERENCES actions(id),
    interaction_node_id INTEGER NOT NULL REFERENCES nodes(id),
    node_id INTEGER NOT NULL REFERENCES nodes(id)
);
CREATE TABLE node_presentation_revisions (
    node_id INTEGER PRIMARY KEY REFERENCES nodes(id),
    revision INTEGER NOT NULL CHECK(revision >= 1)
);
CREATE TABLE pending_node_presentations (
    interaction_node_id INTEGER NOT NULL REFERENCES nodes(id),
    node_id INTEGER NOT NULL REFERENCES nodes(id),
    expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
    package TEXT NOT NULL,
    assets TEXT NOT NULL,
    PRIMARY KEY(interaction_node_id,node_id)
);
