use sqlx::SqliteConnection;

use crate::{ActionId, GraphError, NodeId};

pub(crate) struct CompletionTable<'connection> {
    connection: &'connection mut SqliteConnection,
}

impl<'connection> CompletionTable<'connection> {
    pub(crate) async fn resolved_invoke_roots(
        &mut self,
        completion_ids: &[NodeId],
    ) -> Result<Vec<NodeId>, GraphError> {
        let ids: Vec<i64> = completion_ids.iter().map(|id| id.value()).collect();
        let rows: Vec<i64> = sqlx::query_scalar(
            "SELECT DISTINCT c.interaction_node_id FROM json_each(?1) requested
             JOIN completions c ON c.interaction_node_id=requested.value
             JOIN nodes owner ON owner.id=c.interaction_node_id
             JOIN actions root ON root.id=c.root_action_id
             JOIN layer_actions membership ON membership.layer_id=root.target_layer_id
             JOIN invoke_resolution_transitions receipt ON receipt.action_id=membership.action_id
             WHERE NOT EXISTS(SELECT 1 FROM graph_imports imported WHERE imported.thread_id=owner.thread_id)")
            .bind(serde_json::to_string(&ids).map_err(|error|GraphError::Internal(error.to_string()))?)
            .fetch_all(&mut *self.connection).await?;
        rows.into_iter()
            .map(|id| {
                NodeId::new(id)
                    .ok_or_else(|| GraphError::Internal("invalid completion identity".into()))
            })
            .collect()
    }

    pub(crate) fn new(connection: &'connection mut SqliteConnection) -> Self {
        Self { connection }
    }

    pub(crate) async fn root_action(
        &mut self,
        interaction: NodeId,
    ) -> Result<Option<ActionId>, GraphError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT root_action_id FROM completions WHERE interaction_node_id=?1",
        )
        .bind(interaction.value())
        .fetch_optional(&mut *self.connection)
        .await?
        .map(valid_action_id)
        .transpose()
    }

    pub(crate) async fn insert(
        &mut self,
        interaction: NodeId,
        root_action: ActionId,
    ) -> Result<(), GraphError> {
        sqlx::query("INSERT INTO completions(interaction_node_id,root_action_id) VALUES (?1,?2)")
            .bind(interaction.value())
            .bind(root_action.value())
            .execute(&mut *self.connection)
            .await?;
        Ok(())
    }
}

fn valid_action_id(value: i64) -> Result<ActionId, GraphError> {
    ActionId::new(value)
        .ok_or_else(|| GraphError::Internal("database returned an invalid action ID".into()))
}
