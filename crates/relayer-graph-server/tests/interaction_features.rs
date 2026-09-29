use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use relayer_graph_core::GraphDatabase;
use relayer_graph_server::{ServerState, router};
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn navigator_is_available_without_granting_interaction_permissions() {
    let directory = tempfile::tempdir().unwrap();
    let graph = GraphDatabase::open(directory.path().join("graph.sqlite3"))
        .await
        .unwrap();
    assert!(!graph.interaction_permissions_enabled().await.unwrap());
    let app = router(ServerState::new(graph.clone(), "control"));
    for permissions_enabled in [false, true] {
        graph
            .set_interaction_permissions_enabled(permissions_enabled)
            .await
            .unwrap();
        for authorized in [false, true] {
            let mut request = Request::get("/api/control/interaction-features");
            if authorized {
                request = request.header("authorization", "Bearer control");
            }
            let response = app
                .clone()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            if authorized {
                assert_eq!(response.status(), StatusCode::OK);
                let body: Value = serde_json::from_slice(
                    &to_bytes(response.into_body(), usize::MAX).await.unwrap(),
                )
                .unwrap();
                assert_eq!(body["interactionGraph"], true);
            } else {
                assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            }
        }
        assert_eq!(
            graph.interaction_permissions_enabled().await.unwrap(),
            permissions_enabled,
            "Reading navigator support must not change mutation authority"
        );
    }
}
