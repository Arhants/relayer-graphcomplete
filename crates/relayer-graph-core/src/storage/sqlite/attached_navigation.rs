use super::authored_detail_assets::AuthoredDetailAssetTable;
use crate::{
    ActionId, GraphError, NodeId, PreparedDetailAsset, graph::InteractionScope,
    storage::GraphConnection,
};
use serde_json::Value;

pub(crate) async fn revision(
    connection: &mut GraphConnection,
    node: NodeId,
) -> Result<u64, GraphError> {
    let value: Option<i64> =
        sqlx::query_scalar("SELECT revision FROM node_presentation_revisions WHERE node_id=?1")
            .bind(node.value())
            .fetch_optional(connection)
            .await?;
    u64::try_from(value.unwrap_or(0))
        .map_err(|_| GraphError::Internal("Invalid presentation revision.".into()))
}
pub(crate) async fn stage(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    node: NodeId,
    expected_revision: u64,
    package: &Value,
    assets: &[PreparedDetailAsset],
) -> Result<(), GraphError> {
    sqlx::query("INSERT INTO pending_node_presentations VALUES(?1,?2,?3,?4,?5) ON CONFLICT(interaction_node_id,node_id) DO UPDATE SET expected_revision=excluded.expected_revision,package=excluded.package,assets=excluded.assets")
 .bind(scope.root_node_id.value()).bind(node.value()).bind(i64::try_from(expected_revision).map_err(|_|GraphError::Forbidden("Invalid presentation revision.".into()))?).bind(package.to_string()).bind(serde_json::to_string(assets).map_err(|e|GraphError::Internal(e.to_string()))?).execute(connection).await?;
    Ok(())
}
pub(crate) async fn pending_presentations(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<Vec<(i64, i64, String)>, GraphError> {
    Ok(sqlx::query_as("SELECT node_id,expected_revision,package FROM pending_node_presentations WHERE interaction_node_id=?1").bind(scope.root_node_id.value()).fetch_all(connection).await?)
}
pub(crate) async fn has_pending_addition(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    node: NodeId,
) -> Result<bool, GraphError> {
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attached_navigation_actions m JOIN actions a ON a.id=m.action_id WHERE m.interaction_node_id=?1 AND m.node_id=?2 AND a.state='draft')").bind(scope.root_node_id.value()).bind(node.value()).fetch_one(connection).await?)
}
pub(crate) async fn draft_actions(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<Vec<i64>, GraphError> {
    Ok(sqlx::query_scalar("SELECT m.action_id FROM attached_navigation_actions m JOIN actions a ON a.id=m.action_id WHERE m.interaction_node_id=?1 AND a.state='draft'").bind(scope.root_node_id.value()).fetch_all(connection).await?)
}
pub(crate) async fn changed_nodes(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<Vec<i64>, GraphError> {
    Ok(sqlx::query_scalar("SELECT DISTINCT m.node_id FROM attached_navigation_actions m JOIN actions a ON a.id=m.action_id WHERE m.interaction_node_id=?1 AND a.state='accepted'").bind(scope.root_node_id.value()).fetch_all(connection).await?)
}
pub(crate) async fn identity_collision(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    node: NodeId,
    key: &str,
) -> Result<bool, GraphError> {
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM actions WHERE source_node_id=?1 AND client_key=?2 AND owner_interaction_id!=?3 AND type_id!='interaction.context')").bind(node.value()).bind(key).bind(scope.root_node_id.value()).fetch_one(connection).await?)
}
pub(crate) async fn mark_action(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    action: ActionId,
    node: NodeId,
) -> Result<(), GraphError> {
    sqlx::query("INSERT OR IGNORE INTO attached_navigation_actions VALUES(?1,?2,?3)")
        .bind(action.value())
        .bind(scope.root_node_id.value())
        .bind(node.value())
        .execute(connection)
        .await?;
    Ok(())
}

pub(crate) async fn expand_cycle(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<bool, GraphError> {
    let cyclic:bool=sqlx::query_scalar(r#"WITH RECURSIVE paths(source,target) AS (
        SELECT m.node_id,a.target_layer_id FROM attached_navigation_actions m JOIN actions a ON a.id=m.action_id WHERE m.interaction_node_id=?1 AND a.state='accepted' AND a.relation='expand'
        UNION SELECT p.source,a.target_layer_id FROM paths p JOIN layer_nodes n ON n.layer_id=p.target JOIN actions a ON a.source_node_id=n.node_id WHERE a.state='accepted' AND a.kind='navigate' AND a.relation='expand'
    ) SELECT EXISTS(SELECT 1 FROM paths p JOIN layer_nodes n ON n.layer_id=p.target AND n.node_id=p.source)"#)
        .bind(scope.root_node_id.value()).fetch_one(&mut *connection).await?;
    Ok(cyclic)
}

pub(crate) async fn publish(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<(), GraphError> {
    let additions:Vec<(i64,i64)>=sqlx::query_as("SELECT m.action_id,m.node_id FROM attached_navigation_actions m JOIN actions a ON a.id=m.action_id WHERE m.interaction_node_id=?1 AND a.state='accepted'")
        .bind(scope.root_node_id.value()).fetch_all(&mut *connection).await?;
    for (action, node) in additions {
        // Source occurrence provenance does not limit where a node-owned action appears.
        sqlx::query("INSERT INTO layer_actions(layer_id,action_id,position) SELECT n.layer_id,?1,COALESCE((SELECT MAX(position)+1 FROM layer_actions old WHERE old.layer_id=n.layer_id),0) FROM layer_nodes n JOIN layers l ON l.id=n.layer_id WHERE n.node_id=?2 AND l.state='accepted' AND NOT EXISTS(SELECT 1 FROM graph_imports i WHERE i.thread_id=l.thread_id) AND NOT EXISTS(SELECT 1 FROM layer_actions old WHERE old.layer_id=n.layer_id AND old.action_id=?1)")
            .bind(action).bind(node).execute(&mut *connection).await?;
    }
    let rows:Vec<(i64,String,String)>=sqlx::query_as("SELECT node_id,package,assets FROM pending_node_presentations WHERE interaction_node_id=?1")
        .bind(scope.root_node_id.value()).fetch_all(&mut *connection).await?;
    for (id, package, assets) in rows {
        let node = NodeId::new(id)
            .ok_or_else(|| GraphError::Internal("Invalid presentation node.".into()))?;
        let assets: Vec<PreparedDetailAsset> =
            serde_json::from_str(&assets).map_err(|e| GraphError::Internal(e.to_string()))?;
        AuthoredDetailAssetTable::new(&mut *connection)
            .replace(node, &assets)
            .await?;
        sqlx::query("UPDATE nodes SET authored_detail=?1 WHERE id=?2 AND state='accepted'")
            .bind(package)
            .bind(id)
            .execute(&mut *connection)
            .await?;
        sqlx::query("INSERT INTO node_presentation_revisions VALUES(?1,1) ON CONFLICT(node_id) DO UPDATE SET revision=revision+1").bind(id).execute(&mut *connection).await?;
    }
    discard_pending(connection, scope).await
}

/// Terminal acceptance consumes staging in the publishing transaction. Stop/fail
/// drops only unpublished payloads; accepted node/action provenance is durable.
pub(crate) async fn discard_pending(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<(), GraphError> {
    sqlx::query("DELETE FROM pending_node_presentations WHERE interaction_node_id=?1")
        .bind(scope.root_node_id.value())
        .execute(connection)
        .await?;
    Ok(())
}

pub(crate) async fn closure_has_mutations(
    connection: &mut GraphConnection,
    interaction: NodeId,
    layers: &[crate::ResolvedLayer],
) -> Result<bool, GraphError> {
    let nodes: Vec<i64> = layers
        .iter()
        .flat_map(|l| l.nodes.iter().map(|n| n.id.value()))
        .collect();
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM node_presentation_revisions WHERE node_id IN (SELECT value FROM json_each(?2))) OR EXISTS(SELECT 1 FROM attached_navigation_actions m JOIN actions a ON a.id=m.action_id WHERE (m.interaction_node_id=?1 OR m.node_id IN (SELECT value FROM json_each(?2))) AND a.state='accepted')")
        .bind(interaction.value()).bind(serde_json::to_string(&nodes).map_err(|e|GraphError::Internal(e.to_string()))?).fetch_one(connection).await?)
}

/// Select only requested root memberships with accepted persistent mutations.
pub(crate) async fn affected_root_ids(
    connection: &mut GraphConnection,
    completion_ids: &[NodeId],
) -> Result<Vec<i64>, GraphError> {
    let ids: Vec<i64> = completion_ids.iter().map(|id| id.value()).collect();
    let rows: Vec<i64> = sqlx::query_scalar(
            "SELECT DISTINCT c.interaction_node_id FROM json_each(?1) requested
             JOIN completions c ON c.interaction_node_id=requested.value
             JOIN nodes owner ON owner.id=c.interaction_node_id
             JOIN actions root ON root.id=c.root_action_id AND root.state='accepted'
             WHERE NOT EXISTS(SELECT 1 FROM graph_imports imported WHERE imported.thread_id=owner.thread_id)
             AND (EXISTS(SELECT 1 FROM layer_nodes member JOIN node_presentation_revisions revision ON revision.node_id=member.node_id
                         WHERE member.layer_id=root.target_layer_id)
               OR EXISTS(SELECT 1 FROM layer_actions member JOIN attached_navigation_actions mutation ON mutation.action_id=member.action_id
                         JOIN actions addition ON addition.id=mutation.action_id
                         WHERE member.layer_id=root.target_layer_id AND addition.state='accepted'))")
            .bind(serde_json::to_string(&ids).map_err(|error| GraphError::Internal(error.to_string()))?)
            .fetch_all(connection).await?;
    Ok(rows)
}
