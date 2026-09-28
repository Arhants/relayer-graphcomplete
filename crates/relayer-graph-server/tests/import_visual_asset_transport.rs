use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use base64::Engine as _;
use relayer_graph_core::{GraphDatabase, NodeId};
use relayer_graph_server::{ServerState, router};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tower::ServiceExt;

async fn post(app: &Router, path: &str, value: &Value) -> (StatusCode, Vec<u8>) {
    let response = app
        .clone()
        .oneshot(
            Request::post(path)
                .header("authorization", "Bearer control")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(value).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    (
        status,
        to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec(),
    )
}

fn stage(id: &str, thread: i64) -> Value {
    json!({"importId":id,"sourceSha256":"sha256:fixture","projectId":null,"threadId":thread,"createdAt":"2026-09-26T00:00:00Z"})
}

fn content(bytes: &[u8]) -> Value {
    json!({"digestSha256":format!("{:x}",Sha256::digest(bytes)),"mediaType":"image/png","byteLength":bytes.len(),"contentBase64":base64::engine::general_purpose::STANDARD.encode(bytes)})
}

fn turn(content: &Value) -> Value {
    let mut package = json!({"version":1,"components":[{"id":"main","order":0,"html":"<img alt=\"Visual\" data-asset-mount=\"image\">","css":""}],"mounts":[{"id":"image","componentId":"main","kind":"asset","host":"img","assetId":"visual"}],"assets":[{"id":"visual","digestSha256":content["digestSha256"],"mediaType":"image/png","representation":"image"}]});
    package["integritySha256"] = json!(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&package).unwrap())
    ));
    let nodes: Vec<_> = (1..=3).map(|id| json!({"id":format!("node-{id}"),"kind":"concept","icon":"box","title":format!("Visual {id}"),"detail":"Fallback","authoredDetail":package,"authoredDetailAssets":[{"assetId":"visual","digestSha256":content["digestSha256"],"mediaType":"image/png","byteLength":content["byteLength"],"provenanceSource":"user","provenanceFileName":"visual.png"}]})).collect();
    json!({"sourceTurnId":"turn-1","text":"Show visuals","acceptedView":{"interactionNodeId":"interaction-1","rootAction":{"id":"response","sourceNodeId":"interaction-1","kind":"navigate","relation":"expand","label":"Response","variant":"pill","targetLayerId":"layer-1"},"rootLayerId":"layer-1","layers":[{"layer":{"id":"layer-1","nodes":["node-1","node-2","node-3"],"edges":[],"layout":{"version":1,"placements":[{"nodeId":"node-1","x":0.2,"y":0.5},{"nodeId":"node-2","x":0.5,"y":0.5},{"nodeId":"node-3","x":0.8,"y":0.5}]}},"nodes":nodes,"edges":[],"actions":[]}]}})
}

#[tokio::test]
async fn shared_large_content_crosses_real_import_routes_once_without_relaxing_body_limit() {
    let temporary = tempfile::tempdir().unwrap();
    let file = tempfile::NamedTempFile::new_in(temporary.path()).unwrap();
    let database = GraphDatabase::open(file.path()).await.unwrap();
    let app = router(ServerState::new(database.clone(), "control"));
    // This control-only transport test treats bytes as already media-validated by
    // the host; hostile-format validation has its own Product/Eval e2e coverage.
    let bytes = vec![7_u8; 7 * 1024 * 1024];
    let blob = content(&bytes);
    let turn = turn(&blob);
    let prefix = "/api/control/conversation-import-stages/large";
    assert_eq!(
        post(
            &app,
            "/api/control/conversation-import-stages",
            &stage("large", 71)
        )
        .await
        .0,
        StatusCode::OK
    );
    let mut old_inline = turn.clone();
    for node in old_inline["acceptedView"]["layers"][0]["nodes"]
        .as_array_mut()
        .unwrap()
    {
        node["authoredDetailAssets"][0]["content"] = blob["contentBase64"].clone();
    }
    assert!(serde_json::to_vec(&old_inline).unwrap().len() > 17 * 1024 * 1024);
    assert_eq!(
        post(&app, &format!("{prefix}/turns"), &old_inline).await.0,
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert!(serde_json::to_vec(&turn).unwrap().len() < 16 * 1024);
    assert_eq!(
        post(&app, &format!("{prefix}/visual-asset-contents"), &blob)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        post(&app, &format!("{prefix}/turns"), &turn).await.0,
        StatusCode::OK
    );
    let audit = sqlx::SqlitePool::connect(&format!("sqlite://{}", file.path().display()))
        .await
        .unwrap();
    sqlx::raw_sql("CREATE TABLE content_insert_audit(attempt INTEGER); CREATE TRIGGER audit_content_insert BEFORE INSERT ON authored_detail_asset_contents BEGIN INSERT INTO content_insert_audit VALUES (1); END;")
        .execute(&audit).await.unwrap();
    let (status, response) = post(&app, &format!("{prefix}/finalize"), &json!({})).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&response)
    );
    let insert_attempts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM content_insert_audit")
        .fetch_one(&audit)
        .await
        .unwrap();
    assert_eq!(
        insert_attempts, 1,
        "shared content must be materialized once across logical nodes"
    );
    audit.close().await;
    let receipt: Value = serde_json::from_slice(&response).unwrap();
    for node in receipt["turns"][0]["output"]["rootLayer"]["nodes"]
        .as_array()
        .unwrap()
    {
        let asset = database
            .accepted_detail_asset(NodeId::new(node["id"].as_i64().unwrap()).unwrap(), "visual")
            .await
            .unwrap();
        assert_eq!(asset.content, bytes);
        let node_id = node["id"].as_i64().unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/control/nodes/{node_id}/detail-assets/visual?metadataOnly=true"
                    ))
                    .header("authorization", "Bearer control")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let metadata: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                .unwrap();
        assert_eq!(metadata["digestSha256"], blob["digestSha256"]);
        assert_eq!(metadata["byteLength"], blob["byteLength"]);
        assert_eq!(metadata["provenance"]["fileName"], "visual.png");
        assert!(metadata.get("contentBase64").is_none());
        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/control/nodes/{node_id}/detail-assets/visual?metadataOnly=true"
                    ))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
        let missing = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/control/nodes/{node_id}/detail-assets/missing?metadataOnly=true"
                    ))
                    .header("authorization", "Bearer control")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    }
    let node_id = receipt["turns"][0]["output"]["rootLayer"]["nodes"][0]["id"]
        .as_i64()
        .unwrap();
    let full = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/control/nodes/{node_id}/detail-assets/visual"))
                .header("authorization", "Bearer control")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(full.status(), StatusCode::OK);
    let full: Value =
        serde_json::from_slice(&to_bytes(full.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        full["contentBase64"], blob["contentBase64"],
        "default control read still returns bytes"
    );
    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", file.path().display()))
        .await
        .unwrap();
    let counts: (i64,i64,i64) = sqlx::query_as("SELECT (SELECT COUNT(*) FROM graph_import_asset_contents),(SELECT COUNT(*) FROM authored_detail_asset_contents),(SELECT COUNT(*) FROM authored_detail_assets)").fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (0, 1, 3));
    let imports: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM graph_imports")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(imports, 1, "accepted imports retain ownership metadata");
    pool.close().await;
}

#[tokio::test]
async fn staging_cleanup_failure_rolls_back_materialization_and_can_retry() {
    let temporary = tempfile::tempdir().unwrap();
    let file = tempfile::NamedTempFile::new_in(temporary.path()).unwrap();
    let database = GraphDatabase::open(file.path()).await.unwrap();
    let app = router(ServerState::new(database.clone(), "control"));
    let blob = content(b"retry-safe-content");
    let prefix = "/api/control/conversation-import-stages/retry";
    assert_eq!(
        post(
            &app,
            "/api/control/conversation-import-stages",
            &stage("retry", 111)
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        post(&app, &format!("{prefix}/visual-asset-contents"), &blob)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        post(&app, &format!("{prefix}/turns"), &turn(&blob)).await.0,
        StatusCode::OK
    );
    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", file.path().display()))
        .await
        .unwrap();
    sqlx::query("CREATE TRIGGER fail_stage_cleanup BEFORE DELETE ON graph_import_asset_contents BEGIN SELECT RAISE(ABORT, 'injected cleanup failure'); END").execute(&pool).await.unwrap();
    let (status, _) = post(&app, &format!("{prefix}/finalize"), &json!({})).await;
    assert_ne!(status, StatusCode::OK);
    let counts: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT COUNT(*) FROM graph_import_asset_contents),(SELECT COUNT(*) FROM authored_detail_asset_contents),(SELECT COUNT(*) FROM nodes WHERE thread_id=111)").fetch_one(&pool).await.unwrap();
    assert_eq!(
        counts,
        (1, 0, 0),
        "failed cleanup must roll back accepted content and preserve staged bytes"
    );
    sqlx::query("DROP TRIGGER fail_stage_cleanup")
        .execute(&pool)
        .await
        .unwrap();
    let (status, response) = post(&app, &format!("{prefix}/finalize"), &json!({})).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&response)
    );
    let receipt: Value = serde_json::from_slice(&response).unwrap();
    let node = NodeId::new(
        receipt["turns"][0]["output"]["rootLayer"]["nodes"][0]["id"]
            .as_i64()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        database
            .accepted_detail_asset(node, "visual")
            .await
            .unwrap()
            .content,
        b"retry-safe-content"
    );
    let staged: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM graph_import_asset_contents")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(staged, 0);
    pool.close().await;
}

#[tokio::test]
async fn staged_content_is_import_scoped_and_missing_pins_roll_back_publication() {
    let temporary = tempfile::tempdir().unwrap();
    let file = tempfile::NamedTempFile::new_in(temporary.path()).unwrap();
    let database = GraphDatabase::open(file.path()).await.unwrap();
    let app = router(ServerState::new(database.clone(), "control"));
    let blob = content(b"validated-content");
    for (id, thread) in [("owner", 81), ("other", 82)] {
        assert_eq!(
            post(
                &app,
                "/api/control/conversation-import-stages",
                &stage(id, thread)
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    assert_eq!(
        post(
            &app,
            "/api/control/conversation-import-stages/owner/visual-asset-contents",
            &blob
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        post(
            &app,
            "/api/control/conversation-import-stages/other/turns",
            &turn(&blob)
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, response) = post(
        &app,
        "/api/control/conversation-import-stages/other/finalize",
        &json!({}),
    )
    .await;
    assert_ne!(status, StatusCode::OK);
    assert!(String::from_utf8_lossy(&response).contains("import_asset_content_missing"));
    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", file.path().display()))
        .await
        .unwrap();
    let counts:(i64,i64)=sqlx::query_as("SELECT (SELECT COUNT(*) FROM nodes WHERE thread_id=82),(SELECT COUNT(*) FROM authored_detail_asset_contents)").fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (0, 0));
    database
        .remove_imported_conversation("owner")
        .await
        .unwrap();
    let staged: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM graph_import_asset_contents")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(staged, 0);
    pool.close().await;
}

#[tokio::test]
async fn removing_imports_reclaims_only_unreferenced_accepted_content() {
    let temporary = tempfile::tempdir().unwrap();
    let file = tempfile::NamedTempFile::new_in(temporary.path()).unwrap();
    let database = GraphDatabase::open(file.path()).await.unwrap();
    let app = router(ServerState::new(database.clone(), "control"));
    let blob = content(b"shared-validated-content");
    let mut survivor = None;
    for (id, thread) in [("first", 91), ("second", 92)] {
        let prefix = format!("/api/control/conversation-import-stages/{id}");
        assert_eq!(
            post(
                &app,
                "/api/control/conversation-import-stages",
                &stage(id, thread)
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            post(&app, &format!("{prefix}/visual-asset-contents"), &blob)
                .await
                .0,
            StatusCode::OK
        );
        assert_eq!(
            post(&app, &format!("{prefix}/turns"), &turn(&blob)).await.0,
            StatusCode::OK
        );
        let (status, response) = post(&app, &format!("{prefix}/finalize"), &json!({})).await;
        assert_eq!(status, StatusCode::OK);
        let receipt: Value = serde_json::from_slice(&response).unwrap();
        survivor = NodeId::new(
            receipt["turns"][0]["output"]["rootLayer"]["nodes"][0]["id"]
                .as_i64()
                .unwrap(),
        );
    }
    database
        .remove_imported_conversation("first")
        .await
        .unwrap();
    assert_eq!(
        database
            .accepted_detail_asset(survivor.unwrap(), "visual")
            .await
            .unwrap()
            .content,
        b"shared-validated-content"
    );
    database
        .remove_imported_conversation("second")
        .await
        .unwrap();
    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", file.path().display()))
        .await
        .unwrap();
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM authored_detail_asset_contents")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        remaining, 0,
        "removed conversations must not retain unreferenced asset bytes"
    );
    pool.close().await;
}

#[tokio::test]
async fn draft_asset_replace_clear_and_failed_replace_reclaim_transactionally() {
    use relayer_graph_core::{AuthoredDetailUpdate, NodeDraft, PreparedDetailAsset, ThreadId};
    let temporary = tempfile::tempdir().unwrap();
    let file = tempfile::NamedTempFile::new_in(temporary.path()).unwrap();
    let database = GraphDatabase::open(file.path()).await.unwrap();
    let interaction = database
        .create_interaction(None, ThreadId::new(101).unwrap(), "Visual")
        .await
        .unwrap();
    let writer = database.writer_for_subgraph(interaction.id).await.unwrap();
    let draft = NodeDraft {
        client_key: "visual".into(),
        kind: "concept".into(),
        icon: "box".into(),
        title: "Visual".into(),
        detail: "Fallback".into(),
    };
    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", file.path().display()))
        .await
        .unwrap();
    for bytes in [b"first".as_slice(), b"second".as_slice()] {
        let blob = content(bytes);
        let fixture = turn(&blob);
        let package = &fixture["acceptedView"]["layers"][0]["nodes"][0]["authoredDetail"];
        let asset = PreparedDetailAsset {
            asset_id: "visual".into(),
            digest_sha256: blob["digestSha256"].as_str().unwrap().into(),
            media_type: "image/png".into(),
            byte_length: bytes.len(),
            provenance_source: "user".into(),
            provenance_file_name: "image.png".into(),
            content: bytes.to_vec(),
        };
        writer
            .submit_node_with_prepared_detail_assets(
                &draft,
                AuthoredDetailUpdate::Replace(package),
                Some(std::slice::from_ref(&asset)),
            )
            .await
            .unwrap();
        let stored: Vec<Vec<u8>> =
            sqlx::query_scalar("SELECT content FROM authored_detail_asset_contents")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(
            stored,
            vec![bytes.to_vec()],
            "replacement must reclaim prior bytes"
        );
        let mut invalid = asset;
        invalid.content = b"corrupt".to_vec();
        assert!(
            writer
                .submit_node_with_prepared_detail_assets(
                    &draft,
                    AuthoredDetailUpdate::Replace(package),
                    Some(&[invalid])
                )
                .await
                .is_err()
        );
        let stored: Vec<Vec<u8>> =
            sqlx::query_scalar("SELECT content FROM authored_detail_asset_contents")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(
            stored,
            vec![bytes.to_vec()],
            "failed replacement must roll back content reclamation"
        );
    }
    writer
        .submit_node_with_prepared_detail_assets(&draft, AuthoredDetailUpdate::Clear, None)
        .await
        .unwrap();
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM authored_detail_asset_contents")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(remaining, 0);
    pool.close().await;
}

#[tokio::test]
async fn writer_asset_reads_require_visible_nodes_and_live_authority() {
    use relayer_graph_core::ThreadId;
    let database = GraphDatabase::in_memory().await.unwrap();
    let app = router(ServerState::new(database.clone(), "control"));
    let blob = content(b"trusted raster fixture");
    for (path, value) in [
        (
            "/api/control/conversation-import-stages",
            stage("writer-assets", 71),
        ),
        (
            "/api/control/conversation-import-stages/writer-assets/visual-asset-contents",
            blob.clone(),
        ),
        (
            "/api/control/conversation-import-stages/writer-assets/turns",
            turn(&blob),
        ),
    ] {
        assert_eq!(post(&app, path, &value).await.0, StatusCode::OK);
    }
    let (status, bytes) = post(
        &app,
        "/api/control/conversation-import-stages/writer-assets/finalize",
        &json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let receipt: Value = serde_json::from_slice(&bytes).unwrap();
    let node = NodeId::new(
        receipt["turns"][0]["output"]["rootLayer"]["nodes"][0]["id"]
            .as_i64()
            .unwrap(),
    )
    .unwrap();
    let local = database
        .create_interaction(None, ThreadId::new(71).unwrap(), "local")
        .await
        .unwrap();
    let epoch = database
        .activate_completion_authority(local.id)
        .await
        .unwrap();
    let writer = database
        .writer_for_completion_authority(local.id, epoch)
        .await
        .unwrap();
    writer.get_node(node).await.unwrap();
    assert_eq!(
        writer
            .accepted_detail_asset(node, "visual")
            .await
            .unwrap()
            .content,
        b"trusted raster fixture"
    );
    let foreign = database
        .create_interaction(None, ThreadId::new(72).unwrap(), "foreign")
        .await
        .unwrap();
    let foreign_writer = database.writer_for_subgraph(foreign.id).await.unwrap();
    assert!(foreign_writer.get_node(node).await.is_err());
    assert!(
        foreign_writer
            .accepted_detail_asset(node, "visual")
            .await
            .is_err()
    );
    database
        .cutover_completion_authority(local.id)
        .await
        .unwrap();
    assert!(writer.get_node(node).await.is_err());
    assert!(writer.accepted_detail_asset(node, "visual").await.is_err());
    // Trusted product reads intentionally remain independent of agent authority.
    database
        .accepted_detail_asset(node, "visual")
        .await
        .unwrap();
}
