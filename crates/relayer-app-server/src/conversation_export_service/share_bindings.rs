//! Public binding aliases are export-local graph IDs, never author-chosen keys.
//! Derivation happens once, before both privacy filtering and asset collection.
use super::*;
use relayer_graph_core::{GraphError, map_authored_detail_actions};
use serde_json::{Value, json};

fn invalid_binding() -> GraphError {
    GraphError::Validation {
        code: "share_detail_binding_invalid",
        path: "authoredDetail.mounts".into(),
        message: "A shared detail action must resolve to its exact accepted source node, layer, and action.".into(),
    }
}

/// Resolve against the accepted action's graph-owned source provenance, including
/// reused actions whose original source layer is outside the visible closure.
pub(super) fn project_share_bindings(
    closures: &mut [AcceptedGraphClosure],
    ids: &mut PortableIds,
) -> Result<(), ConversationExportBuildError> {
    // Deduplicate occurrences by durable action identity, not by private key.
    let mut actions = HashMap::new();
    for action in closures
        .iter()
        .flat_map(|closure| &closure.layers)
        .flat_map(|layer| &layer.actions)
    {
        if let Some(previous) = actions.insert(action.id, action.clone())
            && previous != *action
        {
            return Err(ConversationExportBuildError::Invalid(
                "conflicting accepted action in shared snapshot".into(),
            ));
        }
    }
    let mut by_node: HashMap<_, Vec<_>> = HashMap::new();
    for action in actions.values() {
        by_node
            .entry(action.source_node_id)
            .or_default()
            .push(action);
    }
    // Assign stable aliases in snapshot order, independent of HashMap iteration.
    for closure in closures.iter() {
        ids.node(closure.node_id.value());
        ids.action(closure.root_action.id.value());
        ids.layer(closure.root_layer_id.value());
        for resolved in &closure.layers {
            ids.layer(resolved.layer.id.value());
            for node in &resolved.nodes {
                ids.node(node.id.value());
            }
            for action in &resolved.actions {
                ids.action(action.id.value());
                if let Some(source) = action.source_layer_id {
                    ids.layer(source.value());
                }
            }
        }
    }
    for node in closures
        .iter_mut()
        .flat_map(|closure| &mut closure.layers)
        .flat_map(|layer| &mut layer.nodes)
    {
        let Some(package) = &node.authored_detail else {
            continue;
        };
        // All persisted packages were validated at acceptance. Validate again before
        // re-sealing any derived bytes so corrupt input cannot gain a valid digest.
        let derived = map_authored_detail_actions(package, |reference, kind| {
            if reference.pointer("/sourceNode/clientKey").and_then(Value::as_str) != node.client_key.as_deref()
                || node.client_key.is_none()
            { return Err(invalid_binding()); }
            let candidates = by_node.get(&node.id).into_iter().flatten().filter(|action| {
                action.state == RecordState::Accepted
                    && action.client_key.as_deref() == reference.get("clientKey").and_then(Value::as_str)
                    && action.client_key.is_some()
                    && action.source_layer_id.is_some()
                    && action.source_layer_client_key.is_some()
                    && action.source_layer_client_key.as_deref() == reference.pointer("/sourceLayer/clientKey").and_then(Value::as_str)
            }).collect::<Vec<_>>();
            let [action] = candidates.as_slice() else { return Err(invalid_binding()); };
            let kind_matches = match kind {
                "expand" => action.kind == ActionKind::Navigate && action.relation == Some(NavigateRelation::Expand),
                "reference" => action.kind == ActionKind::Navigate && action.relation == Some(NavigateRelation::Reference),
                "invoke" => action.kind == ActionKind::Invoke,
                "input" => action.kind == ActionKind::Input,
                _ => false,
            };
            if !kind_matches { return Err(invalid_binding()); }
            Ok(json!({
                "clientKey": ids.action(action.id.value()),
                "sourceNode": {"clientKey": ids.node(node.id.value())},
                "sourceLayer": {"clientKey": ids.layer(action.source_layer_id.expect("validated source").value())}
            }))
        }).map_err(|error| ConversationExportBuildError::Invalid(error.to_string()))?;
        node.authored_detail = Some(derived);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn seal(package: &mut Value) {
        package.as_object_mut().unwrap().remove("integritySha256");
        package["integritySha256"] = json!(format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(package).unwrap())
        ));
    }

    fn fixture(offset: i64) -> AcceptedGraphClosure {
        let mut package = json!({
            "version": 1,
            "components": [{"id":"main","order":0,"html":"<article><h2>Meet here</h2><button data-gc-mount=\"open\">Compare tradeoffs</button></article>","css":"article{padding:1rem}"}],
            "mounts": [{"id":"open","componentId":"main","kind":"capability","host":"button", "capability":{"kind":"expand","action":{"clientKey":"/Users/private/action","sourceNode":{"clientKey":"/Users/private/node"},"sourceLayer":{"clientKey":"/Users/private/layer"}}}}],
            "assets": []
        });
        seal(&mut package);
        serde_json::from_value(json!({
            "nodeId":offset+1,
            "interaction":{"id":offset+1,"kind":"user-interaction","icon":"user","title":"Compare","detail":"Compare","state":"accepted"},
            "rootAction":{"id":offset+1,"sourceNodeId":offset+1,"kind":"navigate","relation":"expand","label":"Response","variant":"pill","targetLayerId":offset+1,"state":"accepted"},
            "rootLayerId":offset+1,
            "layers":[{
                "layer":{"id":offset+1,"clientKey":"/Users/private/layer","nodes":[offset+2],"edges":[],"state":"accepted"},
                "nodes":[{"id":offset+2,"clientKey":"/Users/private/node","kind":"recommendation","icon":"star","title":"Top pick","detail":"Portable fallback","authoredDetail":package,"state":"accepted"}],
                "edges":[],"actions":[{"id":offset+2,"clientKey":"/Users/private/action","sourceNodeId":offset+2,"sourceLayerId":offset+1,"sourceLayerClientKey":"/Users/private/layer","kind":"navigate","relation":"expand","label":"Compare tradeoffs","variant":"pill","targetLayerId":offset+2,"state":"accepted"}]
            },{
                "layer":{"id":offset+2,"clientKey":"comparison","nodes":[offset+3],"edges":[],"state":"accepted"},
                "nodes":[{"id":offset+3,"clientKey":"comparison","kind":"note","icon":"box","title":"Tradeoffs","detail":"Compare travel","state":"accepted"}],"edges":[],"actions":[]
            }]
        })).unwrap()
    }

    #[test]
    fn shares_action_cards_using_exact_public_aliases_without_mutating_local_export() {
        // Identical author keys in separate completions must never cross-bind.
        let originals = vec![fixture(0), fixture(100)];
        let ordinary = super::super::export_view(
            &originals[0],
            &mut PortableIds::default(),
            &ProjectPathRedactor::new(None),
        )
        .unwrap();
        let mut shared = originals.clone();
        let mut ids = PortableIds::default();
        project_share_bindings(&mut shared, &mut ids).unwrap();
        for (source, projected) in originals.iter().zip(&shared) {
            let view = super::super::export_view(
                projected,
                &mut ids,
                &ProjectPathRedactor::for_share(None),
            )
            .unwrap();
            let root = &view.layers[0];
            let package = root.nodes[0]
                .authored_detail
                .as_ref()
                .expect("safe card survives");
            assert_eq!(
                package["components"],
                source.layers[0].nodes[0].authored_detail.as_ref().unwrap()["components"]
            );
            assert_eq!(
                package["mounts"][0]["capability"]["action"],
                json!({"clientKey":root.actions[0].id,"sourceNode":{"clientKey":root.nodes[0].id},"sourceLayer":{"clientKey":root.layer.id}})
            );
            assert_eq!(
                root.nodes[0].client_key.as_deref(),
                Some(root.nodes[0].id.as_str())
            );
            assert_eq!(
                root.layer.client_key.as_deref(),
                Some(root.layer.id.as_str())
            );
            assert_eq!(
                root.actions[0].client_key.as_deref(),
                Some(root.actions[0].id.as_str())
            );
            assert!(
                !serde_json::to_string(&view)
                    .unwrap()
                    .contains("/Users/private")
            );
            map_authored_detail_actions(package, |reference, _| Ok(reference.clone())).unwrap();
        }
        let ordinary_after = super::super::export_view(
            &originals[0],
            &mut PortableIds::default(),
            &ProjectPathRedactor::new(None),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(ordinary).unwrap(),
            serde_json::to_value(ordinary_after).unwrap()
        );
        assert_eq!(
            originals[0].layers[0].nodes[0]
                .authored_detail
                .as_ref()
                .unwrap()["mounts"][0]["capability"]["action"]["clientKey"],
            "/Users/private/action"
        );
    }

    #[test]
    fn reused_card_keeps_original_action_provenance_outside_visible_layer() {
        let original = fixture(0);
        let mut reused = original.clone();
        reused.layers[0].layer.id = relayer_graph_core::LayerId::new(9).unwrap();
        reused.layers[0].layer.client_key = Some("current occurrence".into());
        reused.root_layer_id = reused.layers[0].layer.id;
        reused.root_action.target_layer_id = Some(reused.root_layer_id);
        let mut ids = PortableIds::default();
        project_share_bindings(std::slice::from_mut(&mut reused), &mut ids).unwrap();
        let view =
            super::super::export_view(&reused, &mut ids, &ProjectPathRedactor::for_share(None))
                .unwrap();
        let source_alias = view.layers[0].actions[0].source_layer_id.as_ref().unwrap();
        assert_ne!(source_alias, &view.layers[0].layer.id);
        assert_eq!(
            view.layers[0].nodes[0].authored_detail.as_ref().unwrap()["mounts"][0]["capability"]["action"]
                ["sourceLayer"]["clientKey"],
            *source_alias
        );
    }

    #[test]
    fn refuses_mismatched_or_ambiguous_bindings_and_corrupt_packages_before_resealing() {
        for change in ["node", "layer", "action", "kind", "integrity", "duplicate"] {
            let mut closure = fixture(0);
            let package = closure.layers[0].nodes[0].authored_detail.as_mut().unwrap();
            match change {
                "node" => {
                    package["mounts"][0]["capability"]["action"]["sourceNode"]["clientKey"] =
                        json!("other")
                }
                "layer" => {
                    package["mounts"][0]["capability"]["action"]["sourceLayer"]["clientKey"] =
                        json!("other")
                }
                "action" => {
                    package["mounts"][0]["capability"]["action"]["clientKey"] = json!("other")
                }
                "kind" => package["mounts"][0]["capability"]["kind"] = json!("invoke"),
                "integrity" => package["components"][0]["html"] = json!("tampered"),
                _ => {}
            }
            if change != "integrity" {
                seal(package);
            }
            if change == "duplicate" {
                let mut duplicate = closure.layers[0].actions[0].clone();
                duplicate.id = relayer_graph_core::ActionId::new(90).unwrap();
                closure.layers[0].actions.push(duplicate);
            }
            assert!(
                project_share_bindings(
                    std::slice::from_mut(&mut closure),
                    &mut PortableIds::default()
                )
                .is_err(),
                "{change}"
            );
        }
    }

    #[test]
    fn rebinding_never_exempts_private_content_from_whole_package_filtering() {
        for private in [
            "/Users/private/node",
            "sk-proj-123456789012345678901234567890",
        ] {
            let mut closure = fixture(0);
            let package = closure.layers[0].nodes[0].authored_detail.as_mut().unwrap();
            package["components"][0]["html"] = json!(format!(
                "<p>{private}</p><button data-gc-mount=\"open\">Compare</button>"
            ));
            seal(package);
            let mut ids = PortableIds::default();
            project_share_bindings(std::slice::from_mut(&mut closure), &mut ids).unwrap();
            let view = super::super::export_view(
                &closure,
                &mut ids,
                &ProjectPathRedactor::for_share(None),
            )
            .unwrap();
            assert!(view.layers[0].nodes[0].authored_detail.is_none());
            assert!(view.layers[0].nodes[0].authored_detail_omitted.is_some());
        }
    }
}
