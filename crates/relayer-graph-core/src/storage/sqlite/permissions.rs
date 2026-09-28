use crate::{
    ActionId, GraphError, InteractionPermission, InteractionPermissions, NodeId,
    graph::InteractionScope,
};
use sqlx::SqliteConnection;

pub(crate) async fn read(
    connection: &mut SqliteConnection,
    interaction: NodeId,
) -> Result<Option<InteractionPermissions>, GraphError> {
    let json: Option<String> = sqlx::query_scalar(
        "SELECT description FROM interaction_permissions WHERE interaction_node_id=?1",
    )
    .bind(interaction.value())
    .fetch_optional(connection)
    .await?;
    json.map(|json| {
        serde_json::from_str(&json).map_err(|_| {
            GraphError::Forbidden("Unsupported interaction permission description.".into())
        })
    })
    .transpose()
}

/// Called exactly during trusted preparation, after context validation and before
/// completion initialization. Recovery never derives authority for old records.
pub(crate) async fn prepare(
    connection: &mut SqliteConnection,
    interaction: NodeId,
) -> Result<(), GraphError> {
    let initialized: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM completion_states WHERE interaction_node_id=?1)",
    )
    .bind(interaction.value())
    .fetch_one(&mut *connection)
    .await?;
    if initialized {
        return Ok(());
    }
    let enabled: bool =
        sqlx::query_scalar("SELECT enabled FROM interaction_permission_config WHERE singleton=1")
            .fetch_one(&mut *connection)
            .await?;
    let action: Option<i64> = sqlx::query_scalar("SELECT leased_action_id FROM nodes WHERE id=?1")
        .bind(interaction.value())
        .fetch_one(&mut *connection)
        .await?;
    let mut permissions = Vec::new();
    if let Some(action) = action {
        permissions.push(InteractionPermission::InvokeResolve {
            action_id: ActionId::new(action)
                .ok_or_else(|| GraphError::Internal("Invalid invocation identity".into()))?,
        });
    }
    let nodes: Vec<i64> = sqlx::query_scalar("SELECT context.target_node_id FROM interaction_context_actions context JOIN nodes target ON target.id=context.target_node_id WHERE context.interaction_node_id=?1 AND NOT EXISTS(SELECT 1 FROM graph_imports imported WHERE imported.thread_id=target.thread_id) ORDER BY context.position")
        .bind(interaction.value()).fetch_all(&mut *connection).await?;
    for node in nodes {
        permissions.push(InteractionPermission::NavigateAdd {
            node_id: NodeId::new(node)
                .ok_or_else(|| GraphError::Internal("Invalid context identity".into()))?,
        });
    }
    let description = serde_json::to_string(&InteractionPermissions::V1 {
        enabled,
        permissions,
    })
    .map_err(|error| GraphError::Internal(error.to_string()))?;
    sqlx::query("INSERT INTO interaction_permissions VALUES(?1,?2)")
        .bind(interaction.value())
        .bind(description)
        .execute(connection)
        .await?;
    Ok(())
}

/// One graph-owned authority seam. Tokens select a scope, never its grants.
pub(crate) async fn authorize(
    connection: &mut SqliteConnection,
    scope: &InteractionScope,
    permission: &InteractionPermission,
) -> Result<(), GraphError> {
    scope.require_active_authority(connection).await?;
    let active: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM completion_states WHERE interaction_node_id=?1 AND lifecycle='active')")
        .bind(scope.root_node_id.value()).fetch_one(&mut *connection).await?;
    if scope.read_only
        || !active
        || !read(connection, scope.root_node_id)
            .await?
            .is_some_and(|snapshot| snapshot.permits(permission))
    {
        return Err(GraphError::Forbidden(
            "This interaction does not authorize the exact operation.".into(),
        ));
    }
    Ok(())
}
