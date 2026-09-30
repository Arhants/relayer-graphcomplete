ALTER TABLE threads ADD COLUMN icon TEXT;
ALTER TABLE threads ADD COLUMN icon_selection_eligible INTEGER NOT NULL DEFAULT 0 CHECK(icon_selection_eligible IN (0,1));
CREATE TRIGGER thread_icon_write_once BEFORE UPDATE OF icon ON threads
WHEN OLD.icon IS NOT NULL AND NEW.icon IS NOT OLD.icon
BEGIN SELECT RAISE(ABORT, 'thread icon is immutable'); END;
