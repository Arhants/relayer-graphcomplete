use super::SqliteProductStore;
use crate::product::{Project, ProjectId};
use crate::storage::StorageError;
use sqlx::{Row, SqliteConnection, sqlite::SqliteRow};

impl SqliteProductStore {
    pub(crate) async fn all_projects(&self) -> Result<Vec<Project>, StorageError> {
        let rows =
            sqlx::query("SELECT id,name,path,created_at,updated_at FROM projects ORDER BY id")
                .fetch_all(&self.pool)
                .await?;
        rows.iter().map(project_from_row).collect()
    }
    pub(crate) async fn consolidate_projects(
        &self,
        groups: &[(ProjectId, ProjectId, String)],
    ) -> Result<(), StorageError> {
        let mut transaction = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        // Preserve the historical scope before applying presentation aliases.
        sqlx::query("UPDATE threads SET working_directory=(SELECT path FROM projects WHERE id=threads.project_id) WHERE working_directory IS NULL AND project_id IS NOT NULL").execute(&mut *transaction).await?;
        // Unverified paths remain separate unresolved entries. Never retain an alias
        // through a changed or unavailable repository identity.
        let aliases = sqlx::query("SELECT id FROM projects WHERE group_project_id IS NOT NULL")
            .fetch_all(&mut *transaction)
            .await?;
        for row in aliases {
            let id: i64 = row.try_get(0)?;
            if !groups.iter().any(|(verified, _, _)| verified.value() == id) {
                sqlx::query("UPDATE projects SET group_project_id=NULL WHERE id=?1")
                    .bind(id)
                    .execute(&mut *transaction)
                    .await?;
            }
        }
        for (id, canonical, name) in groups {
            sqlx::query("UPDATE projects SET group_project_id=?1,name=?2 WHERE id=?3")
                .bind(if id == canonical {
                    None
                } else {
                    Some(canonical.value())
                })
                .bind(name)
                .bind(id.value())
                .execute(&mut *transaction)
                .await?;
        }
        transaction.commit().await?;
        Ok(())
    }
    pub(crate) async fn list_projects(&self) -> Result<Vec<Project>, StorageError> {
        let mut connection = self.pool.acquire().await?;
        fetch_projects(&mut connection).await
    }

    pub(crate) async fn get_project(&self, id: ProjectId) -> Result<Option<Project>, StorageError> {
        sqlx::query("SELECT id,name,path,created_at,updated_at FROM projects WHERE id=?1")
            .bind(id.value())
            .fetch_optional(&self.pool)
            .await?
            .as_ref()
            .map(project_from_row)
            .transpose()
    }

    pub(crate) async fn project_by_path(
        &self,
        path: &str,
    ) -> Result<Option<Project>, StorageError> {
        sqlx::query("SELECT id,name,path,created_at,updated_at FROM projects WHERE path=?1")
            .bind(path)
            .fetch_optional(&self.pool)
            .await?
            .as_ref()
            .map(project_from_row)
            .transpose()
    }

    pub(crate) async fn insert_or_get_project(
        &self,
        name: &str,
        path: &str,
        timestamp: &str,
    ) -> Result<(Project, bool), StorageError> {
        let result = sqlx::query(
            "INSERT INTO projects(name,path,created_at,updated_at) VALUES (?1,?2,?3,?3) ON CONFLICT(path) DO NOTHING",
        )
        .bind(name)
        .bind(path)
        .bind(timestamp)
        .execute(&self.pool)
        .await?;
        let created = result.rows_affected() == 1;
        let project = self
            .project_by_path(path)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;
        Ok((project, created))
    }
}

pub(super) async fn fetch_projects(
    connection: &mut SqliteConnection,
) -> Result<Vec<Project>, StorageError> {
    let rows = sqlx::query(
        "SELECT id,name,path,created_at,updated_at FROM projects WHERE group_project_id IS NULL ORDER BY created_at ASC",
    )
    .fetch_all(&mut *connection)
    .await?;
    let mut projects = rows
        .iter()
        .map(project_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    for project in &mut projects {
        let aliases =
            sqlx::query("SELECT id,path FROM projects WHERE group_project_id=?1 ORDER BY id")
                .bind(project.id.value())
                .fetch_all(&mut *connection)
                .await?;
        project.aliases = aliases
            .iter()
            .map(|row| {
                Ok(crate::product::ProjectAlias {
                    id: row.try_get(0)?,
                    path: row.try_get(1)?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;
    }
    Ok(projects)
}

pub(super) async fn fetch_project(
    connection: &mut SqliteConnection,
    id: ProjectId,
) -> Result<Option<Project>, StorageError> {
    sqlx::query("SELECT id,name,path,created_at,updated_at FROM projects WHERE id=?1")
        .bind(id.value())
        .fetch_optional(connection)
        .await?
        .as_ref()
        .map(project_from_row)
        .transpose()
}

fn project_from_row(row: &SqliteRow) -> Result<Project, StorageError> {
    Ok(Project {
        id: ProjectId::from_database(row.try_get(0)?),
        name: row.try_get(1)?,
        path: row.try_get(2)?,
        aliases: Vec::new(),
        created_at: row.try_get(3)?,
        updated_at: row.try_get(4)?,
    })
}
