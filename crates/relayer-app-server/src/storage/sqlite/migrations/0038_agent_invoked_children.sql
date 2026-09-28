-- A child an agent launched through its completion broker is a semantic child, not a human
-- turn: it does not hold its thread's one active human turn, and only its parent agent may
-- stop it. Existing results with a completion execution were launched that way.
ALTER TABLE action_invocations
ADD COLUMN agent_invoked INTEGER NOT NULL DEFAULT 0
CHECK (agent_invoked IN (0, 1));

-- A child the refused-launch cleanup failed in the product before its graph current is marked
-- until its graph half is confirmed, so startup finishes only those.
ALTER TABLE action_invocations
ADD COLUMN graph_failure_pending INTEGER NOT NULL DEFAULT 0
CHECK (graph_failure_pending IN (0, 1));

UPDATE action_invocations
SET agent_invoked = 1
WHERE result_interaction_id IN (SELECT interaction_id FROM completion_executions);
