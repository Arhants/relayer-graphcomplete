-- Archive is product organization; conversation activity timestamps remain untouched.
ALTER TABLE threads ADD COLUMN archived_at TEXT;
CREATE INDEX threads_archived_at ON threads(archived_at DESC, id DESC);

-- Include native unwind and recoverable admission debt, not just the latest human turn.
CREATE VIEW thread_archive_activity AS
SELECT t.id, (
    EXISTS(SELECT 1 FROM interactions i WHERE i.thread_id=t.id AND i.completion_status IN ('not_started','preparing','running','submitted','waiting_for_approval'))
    OR EXISTS(SELECT 1 FROM interaction_attempts a JOIN interactions i ON i.id=a.interaction_id WHERE i.thread_id=t.id AND a.outcome='running' AND a.native_wait_ended_at IS NULL)
    OR EXISTS(SELECT 1 FROM interaction_submitted_input_attempts a JOIN interactions i ON i.id=a.interaction_id WHERE i.thread_id=t.id AND a.state NOT IN ('accepted','failed','stopped'))
    OR EXISTS(SELECT 1 FROM completion_executions e JOIN interactions i ON i.id=e.interaction_id WHERE i.thread_id=t.id AND e.phase!='settled')
) AS busy FROM threads t;

-- Both race orders are serialized by SQLite: active admission blocks archive;
-- archive blocks new admission. Terminal settlement and reads remain possible.
CREATE TRIGGER thread_archive_busy BEFORE UPDATE OF archived_at ON threads
WHEN NEW.archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM thread_archive_activity WHERE id=NEW.id AND busy)
BEGIN SELECT RAISE(ABORT, 'thread_archive_busy'); END;
CREATE TRIGGER archived_thread_interaction_insert BEFORE INSERT ON interactions
WHEN EXISTS(SELECT 1 FROM threads WHERE id=NEW.thread_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'thread_archived'); END;
CREATE TRIGGER archived_thread_interaction_start BEFORE UPDATE OF completion_status ON interactions
WHEN NEW.completion_status IN ('not_started','preparing','running','submitted','waiting_for_approval')
AND EXISTS(SELECT 1 FROM threads WHERE id=NEW.thread_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'thread_archived'); END;
CREATE TRIGGER archived_thread_attempt_insert BEFORE INSERT ON interaction_attempts
WHEN EXISTS(SELECT 1 FROM threads t JOIN interactions i ON i.thread_id=t.id WHERE i.id=NEW.interaction_id AND t.archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'thread_archived'); END;
CREATE TRIGGER archived_thread_execution_insert BEFORE INSERT ON completion_executions
WHEN NEW.phase!='settled' AND EXISTS(SELECT 1 FROM threads t JOIN interactions i ON i.thread_id=t.id WHERE i.id=NEW.interaction_id AND t.archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'thread_archived'); END;
CREATE TRIGGER archived_thread_execution_start BEFORE UPDATE OF phase ON completion_executions
WHEN NEW.phase!='settled' AND EXISTS(SELECT 1 FROM threads t JOIN interactions i ON i.thread_id=t.id WHERE i.id=NEW.interaction_id AND t.archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'thread_archived'); END;
CREATE TRIGGER archived_thread_input_insert BEFORE INSERT ON interaction_submitted_input_attempts
WHEN NEW.state NOT IN ('accepted','failed','stopped') AND EXISTS(SELECT 1 FROM threads t JOIN interactions i ON i.thread_id=t.id WHERE i.id=NEW.interaction_id AND t.archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'thread_archived'); END;
CREATE TRIGGER archived_thread_input_start BEFORE UPDATE OF state ON interaction_submitted_input_attempts
WHEN NEW.state NOT IN ('accepted','failed','stopped') AND EXISTS(SELECT 1 FROM threads t JOIN interactions i ON i.thread_id=t.id WHERE i.id=NEW.interaction_id AND t.archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'thread_archived'); END;
