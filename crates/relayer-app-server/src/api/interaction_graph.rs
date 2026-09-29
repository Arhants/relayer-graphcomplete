//! Read projection only. Context provenance identifies the layer owner, never
//! the persistent node author or a chronological predecessor.
use super::ApiState;
use crate::product::ThreadId;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};

// Bound only B3 enrichment; ordinary workspace projection keeps its existing semantics.
pub(super) fn projection_deadline() -> tokio::time::Instant {
    tokio::time::Instant::now() + std::time::Duration::from_secs(5)
}

pub(super) async fn project_before(
    state: &ApiState,
    thread_id: ThreadId,
    viewer: i64,
    contexts: Vec<(i64, i64)>,
    deadline: tokio::time::Instant,
) -> Value {
    if tokio::time::Instant::now() < deadline
        && let Ok(value) =
            tokio::time::timeout_at(deadline, project(state, thread_id, viewer, contexts)).await
    {
        return value;
    }
    json!({"enabled":true,"complete":false,"sources":[]})
}

async fn project(
    state: &ApiState,
    thread_id: ThreadId,
    viewer: i64,
    contexts: Vec<(i64, i64)>,
) -> Value {
    let Some(runtime) = state.runtime.as_ref() else {
        return json!({"enabled":false,"sources":[]});
    };
    let Ok(current) = state.product.get_thread(thread_id).await else {
        return json!({"enabled":true,"complete":false,"sources":[]});
    };
    let mut complete = true;
    let mut layer_owners = HashMap::new();
    let mut groups = BTreeMap::<i64, BTreeMap<i64, Vec<i64>>>::new();
    for (layer, node) in contexts {
        let owner = match layer_owners.get(&layer) {
            Some(owner) => *owner,
            None => {
                let owner = runtime
                    .get_layer_owner(viewer, layer)
                    .await
                    .ok()
                    .filter(|r| r.layer_id == layer)
                    .map(|r| r.owner_interaction_node_id);
                layer_owners.insert(layer, owner);
                owner
            }
        };
        if owner.is_none() {
            complete = false;
        }
        if let Some(owner) = owner {
            let nodes = groups.entry(owner).or_default().entry(layer).or_default();
            if !nodes.contains(&node) {
                nodes.push(node);
            }
        }
    }
    let invocation = match runtime.interaction_metadata(viewer).await {
        Ok(metadata) if metadata.node_id == viewer => metadata.invocation,
        _ => {
            complete = false;
            None
        }
    };
    if let Some(origin) = invocation {
        groups.entry(origin.source_interaction_node_id).or_default();
    }
    let mut sources = Vec::new();
    for (owner, layers) in groups {
        let Ok(source) = state.product.get_interaction_by_graph_node_id(owner).await else {
            complete = false;
            continue;
        };
        let Ok(source_thread) = state.product.get_thread(source.thread_id).await else {
            complete = false;
            continue;
        };
        let same_scope = match current.thread.project_id {
            Some(project) => source_thread.thread.project_id == Some(project),
            None => source.thread_id == thread_id,
        };
        if !same_scope || source_thread.thread.imported {
            complete = false;
            continue;
        }
        sources.push(json!({"interactionId":source.id.value(),"threadId":source.thread_id.value(),"graphNodeId":owner,"text":source.text,"completionStatus":source.completion_status,
            "layers":layers.into_iter().map(|(layer,nodes)|json!({"layerId":layer,"nodeIds":nodes})).collect::<Vec<_>>(),
            "invocationActionId":invocation.filter(|origin|origin.source_interaction_node_id==owner).map(|origin|origin.source_action_id)}));
    }
    json!({"enabled":true,"complete":complete,"sources":sources})
}
