use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use relayer_graph_core::{ActionDraft, GraphDatabase, LayerDraft, NodeDraft, ThreadId};
use relayer_graph_server::{ServerState, router};
use serde_json::{Value, json};
use tower::ServiceExt;

#[tokio::test]
async fn batch_closures_require_control_authority_and_preserve_order_and_missing_slots() {
    let graph = GraphDatabase::in_memory().await.unwrap();
    let root = graph
        .create_interaction(None, ThreadId::new(1).unwrap(), "Accepted")
        .await
        .unwrap();
    let writer = graph.writer_for_subgraph(root.id).await.unwrap();
    let node = writer
        .submit_node(&NodeDraft {
            client_key: "node".into(),
            kind: "concept".into(),
            icon: "box".into(),
            title: "Node".into(),
            detail: "Body".into(),
        })
        .await
        .unwrap();
    let layer: LayerDraft = serde_json::from_value(json!({"clientKey":"layer","nodes":[node.id],"edges":[],"layout":{"version":1,"placements":[{"nodeId":node.id,"x":0.5,"y":0.5}]}})).unwrap();
    let layer = writer.submit_layer(&layer).await.unwrap();
    let action: ActionDraft = serde_json::from_value(json!({"clientKey":"response","sourceNodeId":root.id,"kind":"navigate","relation":"expand","label":"Response","variant":"pill","targetLayerId":layer.id})).unwrap();
    writer.add_action(&action).await.unwrap();
    writer.complete(root.id).await.unwrap();
    let pending = graph
        .create_interaction(None, ThreadId::new(2).unwrap(), "Pending")
        .await
        .unwrap();
    let app = router(ServerState::new(graph.clone(), "control"));
    for token in [None, Some("wrong"), Some("control")] {
        let mut request = Request::post("/api/control/accepted-closures")
            .header("content-type", "application/json");
        if let Some(token) = token {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        let response = app
            .clone()
            .oneshot(
                request
                    .body(Body::from(
                        json!({"interactionNodeIds":[pending.id,root.id,root.id]}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        if token != Some("control") {
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            continue;
        }
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                .unwrap();
        assert_eq!(body["closures"][0], Value::Null);
        assert_eq!(body["closures"][1]["nodeId"], json!(root.id));
        assert_eq!(body["closures"][1], body["closures"][2]);
        assert_eq!(body["closures"].as_array().unwrap().len(), 3);
    }
    // Revision checks are authenticated and run before missing association reads.
    for metadata_only in [false, true] {
        let path = format!(
            "/api/control/nodes/{}/detail-assets/removed?metadataOnly={metadata_only}&expectedRevision=1",
            node.id
        );
        for token in ["wrong", "control"] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(&path)
                        .header("authorization", format!("Bearer {token}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            if token == "wrong" {
                assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            } else {
                assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
                let body: Value = serde_json::from_slice(
                    &to_bytes(response.into_body(), usize::MAX).await.unwrap(),
                )
                .unwrap();
                assert_eq!(body["error"]["code"], "asset_snapshot_changed");
            }
        }
    }
    for ids in [json!([0]), json!([999999]), json!(vec![root.id; 10_001])] {
        let response = app
            .clone()
            .oneshot(
                Request::post("/api/control/accepted-closures")
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer control")
                    .body(Body::from(json!({"interactionNodeIds":ids}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(response.status().is_client_error());
    }
    assert!(!graph.interaction_permissions_enabled().await.unwrap());
}
