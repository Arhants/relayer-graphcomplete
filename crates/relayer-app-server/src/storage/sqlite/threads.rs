use super::{SqliteProductStore, catalog};
use crate::product::{InteractionId, ProjectId, Thread, ThreadId, ValidateModelSelectionCommand};
use crate::storage::{NewThreadRecord, StorageError};
use sqlx::{Row, SqliteConnection, sqlite::SqliteRow};

const THREAD_COLUMNS: &str = r#"
    SELECT t.id,t.title,t.project_id,t.created_at,t.updated_at,
           t.harness_configuration_name,
           t.permission_profile_id,
           (SELECT id FROM interactions WHERE thread_id=t.id ORDER BY sequence ASC LIMIT 1),
           t.conversation_import_id IS NOT NULL, t.icon, t.icon_selection_eligible
    FROM threads t
"#;

const VISIBLE_THREAD: &str = "t.surface='conversation' AND (t.conversation_import_id IS NULL OR EXISTS(SELECT 1 FROM conversation_imports ci WHERE ci.id=t.conversation_import_id AND ci.state='published'))";

impl SqliteProductStore {
    pub(crate) async fn list_threads(&self) -> Result<Vec<Thread>, StorageError> {
        let mut connection = self.pool.acquire().await?;
        fetch_threads(&mut connection).await
    }

    pub(crate) async fn get_thread(&self, id: ThreadId) -> Result<Option<Thread>, StorageError> {
        let mut connection = self.pool.acquire().await?;
        fetch_thread(&mut connection, id).await
    }

    #[cfg(test)]
    pub(crate) async fn insert_thread_with_initial_interaction(
        &self,
        record: NewThreadRecord<'_>,
    ) -> Result<Thread, StorageError> {
        self.insert_thread_with_initial_interaction_and_personal_presentation(record, None)
            .await
    }

    pub(crate) async fn insert_thread_with_initial_interaction_and_personal_presentation(
        &self,
        record: NewThreadRecord<'_>,
        personal_presentation_version_key: Option<&str>,
    ) -> Result<Thread, StorageError> {
        let mut transaction = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        if let Some(selection) = record.model_selection {
            let command = ValidateModelSelectionCommand {
                harness_id: record.harness_configuration_name.to_owned(),
                family_id: selection.family_id,
                provider_id: selection.provider_id.clone(),
                model_id: selection.model_id.clone(),
            };
            catalog::validate_model_selection_on(&mut transaction, &command).await?;
        }
        let thread = sqlx::query(
            "INSERT INTO threads(title,project_id,created_at,updated_at,harness_configuration_name,permission_profile_id,personal_presentation_version_key,icon_selection_eligible) VALUES (?1,?2,?3,?3,?4,?5,?6,?7)",
        )
        .bind(record.title)
        .bind(record.project_id.map(ProjectId::value))
        .bind(record.timestamp)
        .bind(record.harness_configuration_name)
        .bind(record.permission_profile_id)
        .bind(personal_presentation_version_key)
        .bind(record.icon_selection_eligible)
        .execute(&mut *transaction)
        .await?;
        let thread_id = ThreadId::from_database(thread.last_insert_rowid());
        sqlx::query(
            "INSERT INTO interactions(thread_id,sequence,text,created_at,permission_profile_id,model_provider_id,provider_model_id,model_family_id) VALUES (?1,1,?2,?3,?4,?5,?6,?7)",
        )
        .bind(thread_id.value())
        .bind(record.initial_message)
        .bind(record.timestamp)
        .bind(record.permission_profile_id)
        .bind(record.model_selection.map(|selection| selection.provider_id.as_str()))
        .bind(record.model_selection.map(|selection| selection.model_id.as_str()))
        .bind(record.model_selection.map(|selection| selection.family_id.value()))
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        self.get_thread(thread_id)
            .await?
            .ok_or_else(|| sqlx::Error::RowNotFound.into())
    }
}

pub(super) async fn fetch_threads(
    connection: &mut SqliteConnection,
) -> Result<Vec<Thread>, StorageError> {
    let rows = sqlx::query(&format!(
        "{THREAD_COLUMNS} WHERE {VISIBLE_THREAD} ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC"
    ))
    .fetch_all(connection)
    .await?;
    rows.iter().map(thread_from_row).collect()
}

pub(super) async fn fetch_thread(
    connection: &mut SqliteConnection,
    id: ThreadId,
) -> Result<Option<Thread>, StorageError> {
    sqlx::query(&format!(
        "{THREAD_COLUMNS} WHERE t.id=?1 AND {VISIBLE_THREAD}"
    ))
    .bind(id.value())
    .fetch_optional(connection)
    .await?
    .as_ref()
    .map(thread_from_row)
    .transpose()
}

fn thread_from_row(row: &SqliteRow) -> Result<Thread, StorageError> {
    Ok(Thread {
        id: ThreadId::from_database(row.try_get(0)?),
        title: row.try_get(1)?,
        icon: row.try_get(9)?,
        icon_selection_eligible: row.try_get::<i64, _>(10)? != 0,
        project_id: row
            .try_get::<Option<i64>, _>(2)?
            .map(ProjectId::from_database),
        created_at: row.try_get(3)?,
        updated_at: row.try_get(4)?,
        harness_configuration_name: row.try_get(5)?,
        permission_profile_id: row.try_get(6)?,
        root_interaction_id: InteractionId::from_database(row.try_get(7)?),
        imported: row.try_get::<i64, _>(8)? != 0,
    })
}

/// Product metadata commits in the same transaction as the graph-authoritative receipt.
/// Invalid or absent selection never blocks otherwise accepted graph work.
pub(super) async fn commit_thread_icon(
    connection: &mut SqliteConnection,
    interaction_id: InteractionId,
    output: &serde_json::Value,
) -> Result<(), StorageError> {
    let Some(icon) = output
        .get("threadIconProposal")
        .and_then(serde_json::Value::as_str)
        .and_then(relayer_graph_core::resolve_icon_name)
    else {
        return Ok(());
    };
    sqlx::query("UPDATE threads SET icon=?1 WHERE id=(SELECT thread_id FROM interactions WHERE id=?2 AND completion_status='accepted') AND icon IS NULL AND icon_selection_eligible=1 AND surface='conversation' AND conversation_import_id IS NULL")
        .bind(icon).bind(interaction_id.value()).execute(connection).await?;
    Ok(())
}

#[cfg(test)]
mod icon_tests {
    use super::*;
    use crate::product::AcceptedInteractionCompletion;

    async fn accept(store: &SqliteProductStore, thread: &Thread, proposal: serde_json::Value) {
        let id = store
            .insert_interaction(thread.id, "Later completion", None, false, false)
            .await
            .unwrap()
            .id;
        sqlx::query("UPDATE interactions SET completion_status='running',graph_node_id=?2,harness_configuration_name='fixture',harness_configuration_digest='digest',effective_execution_digest='execution',effective_permission_receipt_json='{}' WHERE id=?1")
            .bind(id.value()).bind(id.value() + 10000).execute(&store.pool).await.unwrap();
        store
            .accept_interaction_completion(AcceptedInteractionCompletion {
                interaction_id: id,
                graph_node_id: id.value() + 10000,
                harness_configuration_name: "fixture",
                harness_configuration_digest: "digest",
                effective_execution_digest: "execution",
                effective_permission_receipt: &serde_json::json!({}),
                output: &proposal,
            })
            .await
            .unwrap();
    }

    async fn create(store: &SqliteProductStore, eligible: bool) -> Thread {
        store
            .insert_thread_with_initial_interaction(NewThreadRecord {
                icon_selection_eligible: eligible,
                title: "Learn Rust",
                project_id: None,
                initial_message: "Help me learn Rust",
                harness_configuration_name: "fixture",
                permission_profile_id: "auto",
                model_selection: None,
                timestamp: "1",
            })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn thread_icon_acceptance_retry_write_once_and_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("product.sqlite");
        let store = SqliteProductStore::open(&path).await.unwrap();
        let thread = create(&store, true).await;
        assert_eq!(thread.icon, None);
        // Draft, failed and stopped records have no acceptance authority.
        for state in ["running", "failed", "stopped"] {
            sqlx::query("UPDATE interactions SET completion_status=?1 WHERE id=?2")
                .bind(state)
                .bind(thread.root_interaction_id.value())
                .execute(&store.pool)
                .await
                .unwrap();
            let mut tx = store.pool.begin().await.unwrap();
            commit_thread_icon(
                &mut tx,
                thread.root_interaction_id,
                &serde_json::json!({"threadIconProposal":"book-open"}),
            )
            .await
            .unwrap();
            tx.commit().await.unwrap();
            assert_eq!(
                store.get_thread(thread.id).await.unwrap().unwrap().icon,
                None
            );
        }
        for proposal in [
            serde_json::json!({}),
            serde_json::json!({"threadIconProposal":"bad-icon"}),
            serde_json::json!({"threadIconProposal":42}),
        ] {
            accept(&store, &thread, proposal).await;
            assert_eq!(
                store.get_thread(thread.id).await.unwrap().unwrap().icon,
                None
            );
        }
        accept(
            &store,
            &thread,
            serde_json::json!({"threadIconProposal":"Book Open"}),
        )
        .await;
        assert_eq!(
            store
                .get_thread(thread.id)
                .await
                .unwrap()
                .unwrap()
                .icon
                .as_deref(),
            Some("book-open")
        );
        accept(
            &store,
            &thread,
            serde_json::json!({"threadIconProposal":"code"}),
        )
        .await;
        sqlx::query("UPDATE threads SET title='New topic' WHERE id=?1")
            .bind(thread.id.value())
            .execute(&store.pool)
            .await
            .unwrap();
        assert!(
            sqlx::query("UPDATE threads SET icon='code' WHERE id=?1")
                .bind(thread.id.value())
                .execute(&store.pool)
                .await
                .is_err()
        );
        store.pool.close().await;
        let reopened = SqliteProductStore::open(&path).await.unwrap();
        let saved = reopened.get_thread(thread.id).await.unwrap().unwrap();
        assert_eq!(saved.title, "New topic");
        assert_eq!(saved.icon.as_deref(), Some("book-open"));
    }

    #[tokio::test]
    async fn thread_icon_eval_exclusion_and_acceptance_recovery() {
        let directory = tempfile::tempdir().unwrap();
        let store = SqliteProductStore::open(&directory.path().join("product.sqlite"))
            .await
            .unwrap();
        let eval = create(&store, false).await;
        accept(
            &store,
            &eval,
            serde_json::json!({"threadIconProposal":"code"}),
        )
        .await;
        assert_eq!(store.get_thread(eval.id).await.unwrap().unwrap().icon, None);
        let normal = create(&store, true).await;
        sqlx::query("UPDATE interactions SET completion_status='running',graph_node_id=42,harness_configuration_name='fixture',harness_configuration_digest='digest',effective_execution_digest='execution',effective_permission_receipt_json='{}' WHERE id=?1")
            .bind(normal.root_interaction_id.value()).execute(&store.pool).await.unwrap();
        let output = serde_json::json!({"threadIconProposal":"compass"});
        assert!(
            store
                .recover_interaction_accepted(normal.root_interaction_id, &output)
                .await
                .unwrap()
        );
        assert!(
            !store
                .recover_interaction_accepted(
                    normal.root_interaction_id,
                    &serde_json::json!({"threadIconProposal":"code"})
                )
                .await
                .unwrap()
        );
        assert_eq!(
            store
                .get_thread(normal.id)
                .await
                .unwrap()
                .unwrap()
                .icon
                .as_deref(),
            Some("compass")
        );
    }
}
