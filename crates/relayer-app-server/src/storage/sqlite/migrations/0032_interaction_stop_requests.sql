CREATE TABLE interaction_stop_requests (
    interaction_id INTEGER NOT NULL PRIMARY KEY REFERENCES interactions(id) ON DELETE CASCADE,
    error TEXT
);
