ALTER TABLE threads ADD COLUMN working_directory TEXT;
ALTER TABLE threads ADD COLUMN checkout_context_json TEXT;
UPDATE threads SET working_directory=(SELECT path FROM projects WHERE projects.id=threads.project_id) WHERE project_id IS NOT NULL;
ALTER TABLE projects ADD COLUMN group_project_id INTEGER REFERENCES projects(id);
CREATE TABLE thread_creation_requests (
 request_id TEXT PRIMARY KEY NOT NULL,
 payload TEXT NOT NULL,
 thread_id INTEGER NOT NULL UNIQUE REFERENCES threads(id) ON DELETE CASCADE
);
