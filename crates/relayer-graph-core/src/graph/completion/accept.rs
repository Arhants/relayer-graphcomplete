use crate::{
    GraphError,
    graph::InteractionScope,
    storage::{
        GraphConnection,
        sqlite::{
            actions::ActionTable, completions::CompletionTable, edges::EdgeTable,
            layers::LayerTable, nodes::NodeTable,
        },
    },
};

use super::plan::CompletionPlan;

pub(crate) async fn finalize(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    plan: &CompletionPlan,
) -> Result<(), GraphError> {
    super::super::attached_navigation::publish(connection, scope).await?;
    if let Some(lease) = plan.lease {
        let typed = crate::storage::sqlite::permissions::read(connection, scope.root_node_id)
            .await?
            .is_some_and(|snapshot| snapshot.enabled());
        if typed {
            crate::storage::sqlite::permissions::authorize(
                connection,
                scope,
                &crate::InteractionPermission::InvokeResolve {
                    action_id: lease.action_id,
                },
            )
            .await?;
        }
        ActionTable::new(&mut *connection)
            .resolve_leased_invoke(
                lease.action_id,
                plan.root_layer_id()?,
                typed.then_some(scope.root_node_id),
            )
            .await?;
    }
    CompletionTable::new(connection)
        .insert(scope.root_node_id, plan.root_action()?.id)
        .await
}

pub(crate) async fn publish(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    plan: &CompletionPlan,
    revision: Option<u64>,
) -> Result<(), GraphError> {
    for layer in &plan.layers {
        LayerTable::new(&mut *connection)
            .publish_owned(*layer, scope.root_node_id, revision)
            .await?;
    }
    for node in &plan.nodes {
        NodeTable::new(&mut *connection)
            .publish_owned(*node, scope.root_node_id, revision)
            .await?;
    }
    for edge in &plan.edges {
        EdgeTable::new(&mut *connection)
            .publish_owned(*edge, scope.root_node_id, revision)
            .await?;
    }
    for action in &plan.actions {
        ActionTable::new(&mut *connection)
            .publish_owned(*action, scope.root_node_id, revision)
            .await?;
    }
    let typed = crate::storage::sqlite::permissions::read(connection, scope.root_node_id)
        .await?
        .is_some_and(|snapshot| snapshot.enabled());
    for (layer, actions) in &plan.layer_actions {
        let mut actions = actions.clone();
        if typed {
            // A validated invoke belongs to its node, including occurrences in
            // other layers authored by this same completion. Do not broaden
            // authored navigate projection without its separate cycle checks.
            let invokes: Vec<i64> = sqlx::query_scalar(
                "SELECT a.id FROM actions a JOIN layer_nodes n ON n.node_id=a.source_node_id WHERE n.layer_id=?1 AND a.owner_interaction_id=?2 AND a.kind='invoke' AND a.state='accepted' ORDER BY a.id",
            )
            .bind(layer.value())
            .bind(scope.root_node_id.value())
            .fetch_all(&mut *connection)
            .await?;
            for id in invokes {
                let id = crate::ActionId::new(id).ok_or_else(|| {
                    GraphError::Internal("Invalid accepted invoke identity".into())
                })?;
                if plan.actions.contains(&id) && !actions.contains(&id) {
                    actions.push(id);
                }
            }
        }
        LayerTable::new(&mut *connection)
            .snapshot_actions(*layer, scope.root_node_id, &actions)
            .await?;
    }
    Ok(())
}
