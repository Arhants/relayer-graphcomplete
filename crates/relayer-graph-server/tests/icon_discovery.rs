#![cfg(feature = "ladybug")]
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use relayer_graph_core::GraphDatabase;
use relayer_graph_server::{
    CreateInteractionResponse, ServerState, router, search_index::LadybugSearchIndex,
};
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

async fn request(app: &Router, path: &str, token: &str, value: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::post(path)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(value.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

#[tokio::test]
async fn actual_engine_catalog_discovery_is_ranked_bounded_scoped_and_distinct_from_content() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("graph.db");
    let graph = GraphDatabase::open(&path).await.unwrap();
    let index = Arc::new(
        LadybugSearchIndex::open_reconciled(&path, &graph)
            .await
            .unwrap(),
    );
    let app = router(ServerState::new(graph.clone(), "control").with_search_index(index));
    let bridge = Router::new().route("/visual-assets/operations", axum::routing::post(|axum::Json(request): axum::Json<Value>| async move {
        if request["authority"]["kind"] == "completion" { assert_eq!(request["authority"]["scope"]["threadId"], 1); }
        let result = match request["operation"]["kind"].as_str().unwrap() {
            "icon-candidates" => json!({"candidates":[{"id":"image:fish","name":"Fish","description":"Marine organism photograph","kind":"image","icon":{"kind":"image","assetId":"fish"}}]}),
            "inspect-icon" => { assert_eq!(request["operation"]["assetId"], "fish"); json!({"preview":{"name":"fish.svg","mediaType":"image/svg+xml","contentBase64":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="}}) },
            "activate" => json!({"activated":true,"assetGeneration":1}),
            "pause" => json!({"paused":true,"assetGeneration":2}),
            "finalize-revoke" => json!({"revoked":true,"assetGeneration":2}),
            other => panic!("unexpected bridge operation {other}"),
        };
        axum::Json(json!({"result":result}))
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let worker = tokio::spawn(async move {
        axum::serve(listener, bridge).await.unwrap();
    });
    let response=app.clone().oneshot(Request::put("/api/control/visual-assets/bridge").header("authorization","Bearer control").header("content-type","application/json").body(Body::from(json!({"url":format!("http://{address}"),"token":"fixture-bridge-secret-at-least-32-bytes","generation":1}).to_string())).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let (status, body) = request(
        &app,
        "/api/control/interactions",
        "control",
        json!({"threadId":1,"text":"Discover marine ecology icons"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let interaction: CreateInteractionResponse = serde_json::from_value(body).unwrap();
    let token = &interaction.graph_token;
    let (status, body) = request(
        &app,
        "/api/graph/icons/discover",
        token,
        json!({"kind":"symbols","query":"fish","limit":2}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["items"].as_array().unwrap().len(), 2);
    assert_eq!(body["items"][0]["icon"], "fish");
    assert_eq!(body["candidateSource"], "catalog-text-v1");
    assert!(body["items"][0].get("svg").is_none());
    let (status, body) = request(
        &app,
        "/api/graph/icons/discover",
        token,
        json!({"kind":"symbols","query":"marine","limit":48}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(
        !body["items"].as_array().unwrap().is_empty(),
        "metadata must participate in engine matching"
    );
    let (status, body) = request(
        &app,
        "/api/graph/icons/discover",
        token,
        json!({"kind":"both","query":"fish","limit":2}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let both = body["items"].as_array().unwrap();
    assert_eq!(both.len(), 2);
    assert!(
        both.iter()
            .any(|item| item["id"] == "symbol:fish" && item["icon"] == "fish")
    );
    assert!(
        both.iter()
            .any(|item| item["id"] == "image:fish" && item["icon"]["assetId"] == "fish")
    );
    let (status, body) = request(
        &app,
        "/api/graph/icons/discover",
        token,
        json!({"kind":"images","query":"marine organism","limit":2}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["items"][0]["id"], "image:fish");
    let (status, body) = request(
        &app,
        "/api/graph/icons/inspect",
        token,
        json!({"icons":[{"kind":"image","assetId":"fish"},"fish"],"contactSheet":true}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["previews"].as_array().unwrap().len(), 2);
    for bad in [
        json!({"kind":"symbols","query":"","limit":49}),
        json!({"kind":"unknown","query":"fish"}),
        json!({"kind":"symbols","query":"fish","scope":{"kind":"thread","threadId":2}}),
    ] {
        assert!(
            request(&app, "/api/graph/icons/discover", token, bad)
                .await
                .0
                .is_client_error()
        );
    }
    assert!(
        request(
            &app,
            "/api/graph/icons/discover",
            "foreign",
            json!({"kind":"symbols","query":"fish"})
        )
        .await
        .0
        .is_client_error()
    );
    let (status, body) = request(
        &app,
        "/api/graph/icons/inspect",
        token,
        json!({"icons":["fish","waves"],"contactSheet":true}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["previews"].as_array().unwrap().len(), 2);
    use base64::Engine;
    let sheet = base64::engine::general_purpose::STANDARD
        .decode(body["contactSheet"]["contentBase64"].as_str().unwrap())
        .unwrap();
    let sheet = String::from_utf8(sheet).unwrap();
    assert!(sheet.contains("width=\"256\""));
    assert_eq!(sheet.matches("<image ").count(), 2);
    assert!(
        request(
            &app,
            "/api/graph/icons/inspect",
            token,
            json!({"icons":vec!["fish";9]})
        )
        .await
        .0
        .is_client_error()
    );
    // Catalog search does not create accepted graph nodes or mutate topology.
    assert!(
        graph
            .writer_for_subgraph(interaction.node.id)
            .await
            .unwrap()
            .neighbors(interaction.node.id)
            .await
            .unwrap()
            .is_empty()
    );
    let response = app
        .clone()
        .oneshot(
            Request::delete("/api/control/capabilities")
                .header("authorization", "Bearer control")
                .header("content-type", "application/json")
                .body(Body::from(json!({"graphToken":token}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        request(
            &app,
            "/api/graph/icons/discover",
            token,
            json!({"kind":"symbols","query":"fish"})
        )
        .await
        .0
        .is_client_error()
    );
    assert!(
        request(
            &app,
            "/api/graph/icons/inspect",
            token,
            json!({"icons":["fish"]})
        )
        .await
        .0
        .is_client_error()
    );

    worker.abort();
}
