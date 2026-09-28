-- A child an agent launched through its completion broker is a semantic child, not a human
-- turn: it does not hold its thread's one active human turn, and only its parent agent may
-- stop it. Existing results with a completion execution were launched that way.
ALTER TABLE action_invocations
ADD COLUMN agent_invoked INTEGER NOT NULL DEFAULT 0
CHECK (agent_invoked IN (0, 1));

UPDATE action_invocations
SET agent_invoked = 1
WHERE result_interaction_id IN (SELECT interaction_id FROM completion_executions);
