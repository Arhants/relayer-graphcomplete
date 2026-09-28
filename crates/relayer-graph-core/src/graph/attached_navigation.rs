//! Pending attached-node changes are independent of the response closure. Only
//! terminal acceptance calls `publish`; Advance and draft writes cannot expose them.
use crate::storage::sqlite::{
    actions::ActionTable, attached_navigation as stored, nodes::NodeTable, permissions,
};
use crate::{
    ActionKind, GraphAction, GraphError, InteractionPermission, NodeId, PreparedDetailAsset,
    graph::InteractionScope, storage::GraphConnection,
};
use serde_json::{Value, json};

pub(crate) async fn presentation(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    node: NodeId,
) -> Result<Value, GraphError> {
    permissions::authorize(
        connection,
        scope,
        &InteractionPermission::NavigateAdd { node_id: node },
    )
    .await?;
    let value = NodeTable::new(&mut *connection)
        .visible(scope, node)
        .await?;
    let revision = stored::revision(connection, node).await?;
    let actions = ActionTable::new(&mut *connection)
        .for_source(scope, node, None, true)
        .await?
        .into_iter()
        .map(|r| r.action)
        .collect::<Vec<_>>();
    Ok(json!({"node":value,"revision":revision,"actions":actions}))
}

pub(crate) async fn stage(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    node: NodeId,
    expected_revision: u64,
    package: &Value,
    assets: &[PreparedDetailAsset],
) -> Result<(), GraphError> {
    permissions::authorize(
        connection,
        scope,
        &InteractionPermission::NavigateAdd { node_id: node },
    )
    .await?;
    super::model::validate_authored_detail(package)?;
    let pins = package["assets"].as_array().expect("validated assets");
    if pins.len() != assets.len()
        || pins.iter().zip(assets).any(|(pin, a)| {
            pin["id"] != a.asset_id
                || pin["digestSha256"] != a.digest_sha256
                || pin["mediaType"] != a.media_type
        })
    {
        return Err(GraphError::validation(
            "authored_detail_asset_snapshot_mismatch",
            "authoredDetail.assets",
            "Prepared assets must match the full replacement package.",
        ));
    }
    // Validate bytes without replacing the currently visible node associations.
    for asset in assets {
        use sha2::{Digest, Sha256};
        if asset.byte_length != asset.content.len()
            || format!("{:x}", Sha256::digest(&asset.content)) != asset.digest_sha256
        {
            return Err(GraphError::validation(
                "authored_detail_asset_integrity_mismatch",
                "authoredDetail.assets",
                "Prepared asset bytes do not match the pinned digest.",
            ));
        }
    }
    check_revision(connection, node, expected_revision).await?;
    validate_bindings(connection, scope, node, package).await?;
    stored::stage(connection, scope, node, expected_revision, package, assets).await?;
    Ok(())
}

async fn check_revision(
    connection: &mut GraphConnection,
    node: NodeId,
    expected: u64,
) -> Result<(), GraphError> {
    let revision = stored::revision(connection, node).await?;
    if revision != expected {
        return Err(GraphError::validation(
            "stale_presentation_revision",
            "expectedRevision",
            "The node presentation changed. Reread its presentation and actions, then repair the full replacement.",
        ));
    }
    Ok(())
}

async fn validate_bindings(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
    node: NodeId,
    package: &Value,
) -> Result<(), GraphError> {
    let source = NodeTable::new(&mut *connection)
        .visible(scope, node)
        .await?;
    let actions = ActionTable::new(&mut *connection)
        .for_source(scope, node, None, false)
        .await?
        .into_iter()
        .map(|r| r.action)
        .collect::<Vec<_>>();
    let pending = stored::has_pending_addition(connection, scope, node).await?;
    if !pending {
        return Err(GraphError::validation(
            "attached_addition_required",
            "authoredDetail",
            "Replacement requires at least one new authorized navigate action.",
        ));
    }
    for action in &actions {
        let bound = package["mounts"]
            .as_array()
            .expect("validated mounts")
            .iter()
            .any(|mount| {
                binding_matches(mount, action, source.client_key.as_deref())
                    && usable_mount(package, mount)
            });
        if !bound {
            return Err(GraphError::validation(
                "attached_action_binding_required",
                "authoredDetail.mounts",
                format!(
                    "Replacement must expose preserved or new action {} with its exact identity and kind.",
                    action.id
                ),
            ));
        }
    }
    // Capability mounts cannot silently rebind a control to a foreign or invented action.
    for mount in package["mounts"].as_array().expect("validated mounts") {
        if mount["kind"] == "capability"
            && mount["capability"]["kind"] != "link"
            && !actions
                .iter()
                .any(|a| binding_matches(mount, a, source.client_key.as_deref()))
        {
            return Err(GraphError::validation(
                "attached_action_binding_unknown",
                "authoredDetail.mounts",
                "Replacement controls must bind actions on this exact persistent node.",
            ));
        }
    }
    Ok(())
}

fn binding_matches(mount: &Value, action: &GraphAction, node_key: Option<&str>) -> bool {
    let capability = &mount["capability"];
    let binding = &capability["action"];
    let kind = match action.kind {
        ActionKind::Navigate => match action.relation {
            Some(crate::NavigateRelation::Expand) => "expand",
            Some(crate::NavigateRelation::Reference) => "reference",
            None => return false,
        },
        ActionKind::Invoke => "invoke",
        ActionKind::Input => "input",
        _ => return false,
    };
    let kind_matches = capability["kind"] == kind
        || (capability["kind"] == "invoke" && action.resolved_invoke_interaction_id.is_some());
    kind_matches
        && binding["clientKey"].as_str() == action.client_key.as_deref()
        && reference_matches(
            &binding["sourceNode"],
            Some(action.source_node_id.value()),
            node_key,
        )
        && match action.source_layer_id {
            None => binding.get("sourceLayer").is_none(),
            Some(layer) => reference_matches(
                &binding["sourceLayer"],
                Some(layer.value()),
                action.source_layer_client_key.as_deref(),
            ),
        }
}

pub(crate) async fn validate(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<(), GraphError> {
    let rows = stored::pending_presentations(connection, scope).await?;
    let replacements = rows
        .iter()
        .map(|row| row.0)
        .collect::<std::collections::HashSet<_>>();
    for id in stored::draft_actions(connection, scope).await? {
        let id = crate::ActionId::new(id)
            .ok_or_else(|| GraphError::Internal("Invalid attached action.".into()))?;
        let action = ActionTable::new(&mut *connection)
            .record(scope, id)
            .await?
            .ok_or_else(|| GraphError::Internal("Missing attached action.".into()))?
            .action;
        if !replacements.contains(&action.source_node_id.value()) {
            let node = NodeTable::new(&mut *connection)
                .visible(scope, action.source_node_id)
                .await?;
            if let Some(package) = node.authored_detail {
                // Provisional fail-closed qualification behavior: never discard rich HTML
                // or synthesize supplemental controls. Product decision remains open.
                validate_bindings(connection, scope, node.id, &package).await?;
            }
        }
    }
    for (id, revision, package) in rows {
        let node = NodeId::new(id)
            .ok_or_else(|| GraphError::Internal("Invalid presentation node.".into()))?;
        permissions::authorize(
            connection,
            scope,
            &InteractionPermission::NavigateAdd { node_id: node },
        )
        .await?;
        check_revision(connection, node, revision as u64).await?;
        let package: Value =
            serde_json::from_str(&package).map_err(|e| GraphError::Internal(e.to_string()))?;
        validate_bindings(connection, scope, node, &package).await?;
    }
    Ok(())
}

pub(crate) async fn publish(
    connection: &mut GraphConnection,
    scope: &InteractionScope,
) -> Result<(), GraphError> {
    if stored::expand_cycle(connection, scope).await? {
        return Err(GraphError::validation(
            "expand_cycle",
            "navigate.add",
            "Attached navigation would create a node-owned expansion cycle. Use reference for cyclic context.",
        ));
    }
    stored::publish(connection, scope).await
}

fn reference_matches(reference: &Value, id: Option<i64>, key: Option<&str>) -> bool {
    let has_id = reference.get("id").is_some();
    let has_key = reference.get("clientKey").is_some();
    (has_id || has_key)
        && (!has_id || reference["id"].as_i64() == id)
        && (!has_key || reference["clientKey"].as_str() == key)
}

fn usable_mount(package: &Value, mount: &Value) -> bool {
    let selector = scraper::Selector::parse("[data-gc-mount]").expect("literal selector");
    let mut count = 0;
    let mut usable = false;
    for component in package["components"]
        .as_array()
        .expect("validated components")
    {
        let fragment =
            scraper::Html::parse_fragment(component["html"].as_str().expect("validated html"));
        for element in fragment
            .select(&selector)
            .filter(|element| element.value().attr("data-gc-mount") == mount["id"].as_str())
        {
            count += 1;
            let host = element.value().name();
            let compatible_host = if mount["capability"]["kind"] == "input" {
                matches!(host, "input" | "textarea" | "select")
            } else {
                matches!(host, "button" | "a")
            };
            usable = component["id"] == mount["componentId"]
                && Some(host) == mount["host"].as_str()
                && compatible_host
                && !element
                    .ancestors()
                    .filter_map(scraper::ElementRef::wrap)
                    .any(|parent| {
                        parent.value().attr("hidden").is_some()
                            || matches!(parent.value().name(), "template" | "script" | "style")
                    })
                && element.value().attr("hidden").is_none()
                && element.value().attr("disabled").is_none();
        }
    }
    count == 1 && usable
}
