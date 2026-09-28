-- Conversion receipts identify the sole authorized invoke-to-navigation transition.
-- Losing or changing one would erase typed binding and portability provenance.
CREATE TRIGGER invoke_resolution_no_update
BEFORE UPDATE ON invoke_resolution_transitions
BEGIN SELECT RAISE(ABORT, 'immutable_invoke_resolution'); END;
CREATE TRIGGER invoke_resolution_no_delete
BEFORE DELETE ON invoke_resolution_transitions
BEGIN SELECT RAISE(ABORT, 'immutable_invoke_resolution'); END;
