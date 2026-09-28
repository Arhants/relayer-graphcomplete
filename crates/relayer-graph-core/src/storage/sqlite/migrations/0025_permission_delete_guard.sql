-- A missing snapshot is legacy authority, so deletion must never downgrade it.
CREATE TRIGGER interaction_permissions_no_delete
BEFORE DELETE ON interaction_permissions
BEGIN SELECT RAISE(ABORT, 'immutable_interaction_permissions'); END;
