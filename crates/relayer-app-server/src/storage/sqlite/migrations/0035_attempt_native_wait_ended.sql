-- An attempt whose outcome is still undecided can outlive Relayer's wait on its native run: the
-- execution task stopped waiting without persisting the outcome, or the process that ran it
-- exited with the application. Recording that end lets the attempt stop counting toward the
-- provider removal drain and turns its execution lease into debt, while its outcome stays open
-- for canonical reconciliation. Live native work stays guarded by the harness host's claim.
ALTER TABLE interaction_attempts ADD COLUMN native_wait_ended_at TEXT;
