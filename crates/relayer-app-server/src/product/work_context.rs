use super::{ProductError, Project, ProjectId};
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub(super) struct GitIdentity {
    pub(super) common: PathBuf,
    pub(super) checkout: PathBuf,
    pub(super) root: PathBuf,
    pub(super) name: String,
}

fn git_command(directory: &Path) -> std::process::Command {
    let mut command = std::process::Command::new("git");
    for (key, _) in std::env::vars_os() {
        if key.to_string_lossy().starts_with("GIT_") {
            command.env_remove(key);
        }
    }
    command
        .arg("-C")
        .arg(directory)
        .env("LC_ALL", "C")
        .env("GIT_OPTIONAL_LOCKS", "0");
    command
}

pub(super) async fn git_identity(path: &Path) -> Result<Option<GitIdentity>, ProductError> {
    let directory = path.to_path_buf();
    let output = tokio::task::spawn_blocking(move || {
        git_command(&directory)
            .args([
                "rev-parse",
                "--path-format=absolute",
                "--git-common-dir",
                "--show-toplevel",
            ])
            .output()
    })
    .await
    .map_err(|e| ProductError::Invalid(format!("Git inspection task failed: {e}")))?
    .map_err(|e| ProductError::Invalid(format!("Git inspection unavailable: {e}")))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        if error.contains("not a git repository") {
            // A broken .git marker is an inspection failure, never a non-Git folder.
            if !path
                .ancestors()
                .any(|ancestor| std::fs::symlink_metadata(ancestor.join(".git")).is_ok())
            {
                return Ok(None);
            }
        }
        return Err(ProductError::Invalid(
            "Git repository inspection failed".into(),
        ));
    }
    let text = String::from_utf8(output.stdout)
        .map_err(|_| ProductError::Invalid("Git paths must be UTF-8".into()))?;
    let mut lines = text.lines();
    let common = tokio::fs::canonicalize(
        lines
            .next()
            .ok_or_else(|| ProductError::Invalid("Git common directory missing".into()))?,
    )
    .await
    .map_err(|e| ProductError::Invalid(e.to_string()))?;
    let checkout = tokio::fs::canonicalize(
        lines
            .next()
            .ok_or_else(|| ProductError::Invalid("Git checkout missing".into()))?,
    )
    .await
    .map_err(|e| ProductError::Invalid(e.to_string()))?;
    // A .git pointer can claim the same common directory without registering
    // a checkout. The server owns admission, so renderer inspection is not authority.
    let probe_directory = checkout.clone();
    let inventory = tokio::task::spawn_blocking(move || {
        git_command(&probe_directory)
            .args(["worktree", "list", "--porcelain", "-z"])
            .output()
    })
    .await
    .map_err(|e| ProductError::Invalid(e.to_string()))?
    .map_err(|e| ProductError::Invalid(e.to_string()))?;
    if !inventory.status.success() {
        return Err(ProductError::Invalid(
            "Git worktree inventory unavailable".into(),
        ));
    }
    let inventory = String::from_utf8(inventory.stdout)
        .map_err(|_| ProductError::Invalid("Git paths must be UTF-8".into()))?;
    let mut registered = false;
    for target in inventory
        .split('\0')
        .filter_map(|field| field.strip_prefix("worktree "))
    {
        if tokio::fs::canonicalize(target).await.ok().as_ref() == Some(&checkout) {
            registered = true;
            break;
        }
    }
    if !registered {
        return Err(ProductError::Invalid(
            "The checkout is no longer registered with Git".into(),
        ));
    }
    let root = if common.file_name().is_some_and(|name| name == ".git") {
        common.parent().unwrap().to_path_buf()
    } else {
        checkout.clone()
    };
    let name = root
        .file_name()
        .ok_or_else(|| ProductError::Invalid("Git repository name missing".into()))?
        .to_string_lossy()
        .into_owned();
    Ok(Some(GitIdentity {
        common,
        checkout,
        root,
        name,
    }))
}

pub(super) async fn root_groups(
    projects: &[Project],
) -> Result<Vec<(ProjectId, ProjectId, String)>, ProductError> {
    let mut identities = std::collections::BTreeMap::<PathBuf, Vec<(ProjectId, String)>>::new();
    for project in projects {
        let path = Path::new(&project.path);
        if !path.is_dir() {
            continue;
        }
        // Unresolved legacy records stay untouched and separate. They must not
        // block consolidation of independently verified repository families.
        if let Ok(Some(identity)) = git_identity(path).await {
            if tokio::fs::canonicalize(path).await.ok().as_ref() != Some(&identity.checkout) {
                continue;
            }
            identities
                .entry(identity.common)
                .or_default()
                .push((project.id, identity.name));
        }
    }
    let mut groups = Vec::new();
    for members in identities.values_mut() {
        members.sort_by_key(|(id, _)| id.value());
        let canonical = members[0].0;
        for (id, name) in members {
            groups.push((*id, canonical, name.clone()));
        }
    }
    Ok(groups)
}

pub(super) async fn checkout_context(
    path: &Path,
) -> Result<Option<serde_json::Value>, ProductError> {
    let Some(identity) = git_identity(path).await? else {
        return Ok(None);
    };
    let directory = identity.checkout.clone();
    let (branch, commit) = tokio::task::spawn_blocking(move || {
        let run = |args: &[&str]| {
            let mut command = std::process::Command::new("git");
            for (key, _) in std::env::vars_os() {
                if key.to_string_lossy().starts_with("GIT_") {
                    command.env_remove(key);
                }
            }
            let output = command
                .arg("-C")
                .arg(&directory)
                .args(args)
                .env("GIT_OPTIONAL_LOCKS", "0")
                .output()?;
            Ok::<_, std::io::Error>(
                output
                    .status
                    .success()
                    .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned()),
            )
        };
        Ok::<_, std::io::Error>((
            run(&["symbolic-ref", "--short", "HEAD"])?,
            run(&["rev-parse", "--verify", "HEAD"])?,
        ))
    })
    .await
    .map_err(|e| ProductError::Invalid(e.to_string()))?
    .map_err(|e| ProductError::Invalid(e.to_string()))?;
    Ok(Some(
        serde_json::json!({"repositoryIdentity":identity.common,"checkoutRoot":identity.checkout,"branch":branch,"commit":commit}),
    ))
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ExpectedCheckout {
    pub(crate) repository_identity: String,
    pub(crate) checkout_root: String,
    pub(crate) branch: Option<String>,
    pub(crate) commit: Option<String>,
}

pub(super) async fn normalized_expected_checkout(
    expected: &ExpectedCheckout,
) -> Result<serde_json::Value, ProductError> {
    let mut value =
        serde_json::to_value(expected).map_err(|e| ProductError::Invalid(e.to_string()))?;
    // Electron and Rust can spell the same native path differently (notably
    // Windows verbatim prefixes). Compare filesystem identity, not spelling.
    for field in ["repositoryIdentity", "checkoutRoot"] {
        if let Some(path) = value[field].as_str()
            && let Ok(canonical) = tokio::fs::canonicalize(path).await
        {
            value[field] = serde_json::to_value(canonical)
                .map_err(|e| ProductError::Invalid(e.to_string()))?;
        }
    }
    Ok(value)
}

pub(super) async fn verify_checkout(
    path: &Path,
    expected: &ExpectedCheckout,
) -> Result<(), ProductError> {
    if expected.repository_identity.is_empty() || expected.checkout_root.is_empty() {
        return Err(ProductError::Invalid(
            "expectedCheckout requires repositoryIdentity and checkoutRoot".into(),
        ));
    }
    let current = checkout_context(path).await?;
    let expected = normalized_expected_checkout(expected).await?;
    if current.as_ref() != Some(&expected) {
        return Err(ProductError::CheckoutChanged {
            path: path.to_string_lossy().into(),
            expected: Box::new(expected),
            current: Box::new(current.unwrap_or(serde_json::Value::Null)),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        product::{CreateProjectCommand, CreateThreadCommand, ProductService},
        storage::SqliteProductStore,
    };

    fn git(path: &Path, args: &[&str]) {
        assert!(
            std::process::Command::new("git")
                .env(
                    "GIT_CONFIG_GLOBAL",
                    if cfg!(windows) { "NUL" } else { "/dev/null" }
                )
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .args(["-c", "commit.gpgsign=false"])
                .arg("-C")
                .arg(path)
                .args(args)
                .status()
                .unwrap()
                .success()
        );
    }
    fn initialize(path: &Path) {
        std::fs::create_dir_all(path).unwrap();
        git(path, &["init", "-q", "--object-format=sha1", "-b", "main"]);
        git(
            path,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "initial",
            ],
        );
    }
    fn command(project_id: ProjectId) -> CreateThreadCommand {
        CreateThreadCommand {
            icon_selection_eligible: true,
            title: None,
            project_id: Some(project_id),
            initial_message: "Task".into(),
            harness_configuration_name: "codex-basic".into(),
            personal_presentation_version_key: None,
            permission_profile_id: "full".into(),
            model_selection: None,
            allow_unselected_model: true,
        }
    }

    #[tokio::test]
    async fn scope_persists_across_reopen_and_missing_checkout_never_falls_back() {
        let temp = tempfile::tempdir().unwrap();
        let fixture_root = temp.path().canonicalize().unwrap();
        let root = fixture_root.join("repo");
        initialize(&root);
        let linked = fixture_root.join("linked");
        git(
            &root,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                "feature",
                linked.to_str().unwrap(),
            ],
        );
        let database = fixture_root.join("product.db");
        let store = SqliteProductStore::open(&database).await.unwrap();
        let service = ProductService::new(store, false);
        let project = service
            .create_project(CreateProjectCommand {
                path: root.to_str().unwrap().into(),
                name: None,
                reuse_existing: true,
            })
            .await
            .unwrap()
            .project;
        let thread = service
            .create_thread_in_directory(command(project.id), Some(linked.to_str().unwrap()))
            .await
            .unwrap();
        assert_eq!(thread.icon, None);
        assert!(thread.icon_selection_eligible);
        let (receipt, created) = service
            .create_thread_with_request(
                command(project.id),
                Some(linked.to_str().unwrap()),
                Some("draft-1"),
            )
            .await
            .unwrap();
        assert!(created);
        let (retry, created) = service
            .create_thread_with_request(
                command(project.id),
                Some(linked.to_str().unwrap()),
                Some("draft-1"),
            )
            .await
            .unwrap();
        assert!(!created);
        assert_eq!(retry.id, receipt.id);
        service
            .fail_interaction_completion(
                receipt.root_interaction_id,
                "codex-basic",
                "injected admission failure",
            )
            .await
            .unwrap();
        assert!(
            service
                .restore_unstarted_thread_root(receipt.id)
                .await
                .unwrap()
        );
        assert!(
            !service
                .restore_unstarted_thread_root(receipt.id)
                .await
                .unwrap()
        );
        assert_eq!(
            service
                .get_interaction(receipt.root_interaction_id)
                .await
                .unwrap()
                .completion_status,
            "not_started"
        );
        assert!(
            service
                .claim_interaction_preparing(receipt.root_interaction_id)
                .await
                .unwrap()
        );
        assert!(
            !service
                .claim_interaction_preparing(receipt.root_interaction_id)
                .await
                .unwrap()
        );
        let mut changed = command(project.id);
        changed.initial_message = "Changed".into();
        assert!(
            service
                .create_thread_with_request(
                    changed,
                    Some(linked.to_str().unwrap()),
                    Some("draft-1")
                )
                .await
                .is_err()
        );
        let reopened =
            ProductService::new(SqliteProductStore::open(&database).await.unwrap(), false);
        let saved = reopened.get_thread(thread.id).await.unwrap().thread;
        assert_eq!(
            saved.checkout_context.as_ref().unwrap()["branch"],
            "feature"
        );
        assert_eq!(
            saved.checkout_context.as_ref().unwrap()["checkoutRoot"],
            linked.to_str().unwrap()
        );
        assert_eq!(
            saved.checkout_context.as_ref().unwrap()["commit"]
                .as_str()
                .unwrap()
                .len(),
            40
        );
        assert_eq!(
            saved.working_directory.as_deref(),
            Some(linked.to_str().unwrap())
        );
        assert_eq!(
            reopened
                .thread_directory(&saved, temp.path())
                .await
                .unwrap(),
            linked.to_str().unwrap()
        );
        let gitfile = std::fs::read(linked.join(".git")).unwrap();
        std::fs::remove_file(linked.join(".git")).unwrap();
        assert!(matches!(
            reopened.thread_directory(&saved, temp.path()).await,
            Err(ProductError::FolderUnavailable { .. })
        ));
        std::fs::write(linked.join(".git"), gitfile).unwrap();
        std::fs::remove_dir_all(&linked).unwrap();
        assert!(matches!(
            reopened.thread_directory(&saved, temp.path()).await,
            Err(ProductError::FolderUnavailable { .. })
        ));
        assert!(!linked.exists());
        assert_eq!(
            reopened
                .get_thread(thread.id)
                .await
                .unwrap()
                .interactions
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn root_alias_grouping_keeps_cwd_graph_identity_clones_and_intentional_subfolders() {
        let temp = tempfile::tempdir().unwrap();
        let fixture_root = temp.path().canonicalize().unwrap();
        let root = fixture_root.join("repo");
        initialize(&root);
        let linked = fixture_root.join("linked");
        git(
            &root,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                "feature",
                linked.to_str().unwrap(),
            ],
        );
        let clone = fixture_root.join("clone");
        initialize(&clone);
        std::fs::create_dir_all(root.join("frontend")).unwrap();
        std::fs::create_dir_all(linked.join("frontend")).unwrap();
        let store = SqliteProductStore::open(fixture_root.join("product.db"))
            .await
            .unwrap();
        let (p1, _) = store
            .insert_or_get_project("repo", root.to_str().unwrap(), "1")
            .await
            .unwrap();
        let (p2, _) = store
            .insert_or_get_project("linked", linked.to_str().unwrap(), "2")
            .await
            .unwrap();
        let (p3, _) = store
            .insert_or_get_project("clone", clone.to_str().unwrap(), "3")
            .await
            .unwrap();
        let unresolved = fixture_root.join("unresolved");
        std::fs::create_dir(&unresolved).unwrap();
        std::fs::write(unresolved.join(".git"), "gitdir: /missing-repository").unwrap();
        let (unresolved_project, _) = store
            .insert_or_get_project("Unresolved", unresolved.to_str().unwrap(), "3")
            .await
            .unwrap();
        let (front1, _) = store
            .insert_or_get_project("frontend", root.join("frontend").to_str().unwrap(), "4")
            .await
            .unwrap();
        let (front2, _) = store
            .insert_or_get_project("frontend", linked.join("frontend").to_str().unwrap(), "5")
            .await
            .unwrap();
        let service = ProductService::new(store.clone(), false);
        let thread = service.create_thread(command(p2.id)).await.unwrap();
        let projects = service.consolidate_projects().await.unwrap();
        assert_eq!(projects.len(), 5);
        assert!(
            projects
                .iter()
                .any(|p| p.id == unresolved_project.id && p.name == "Unresolved")
        );
        assert!(projects.iter().any(|p| p.id == p3.id));
        assert!(projects.iter().any(|p| p.id == front1.id));
        assert!(projects.iter().any(|p| p.id == front2.id));
        let canonical = projects.iter().find(|p| p.id == p1.id).unwrap();
        assert_eq!(canonical.aliases[0].id, p2.id.value());
        let saved = service.get_thread(thread.id).await.unwrap().thread;
        assert_eq!(saved.project_id, Some(p2.id));
        assert_eq!(saved.grouped_project_id, Some(p1.id));
        assert_eq!(
            saved.working_directory.as_deref(),
            Some(linked.to_str().unwrap())
        );
        assert_eq!(service.consolidate_projects().await.unwrap().len(), 5);
        let picked = service
            .create_project(CreateProjectCommand {
                path: linked.join("frontend").to_str().unwrap().into(),
                name: None,
                reuse_existing: true,
            })
            .await
            .unwrap();
        assert_eq!(picked.project.id, p1.id);
        let standalone_sub = service
            .create_project_with_scope(
                CreateProjectCommand {
                    path: linked.join("frontend").to_str().unwrap().into(),
                    name: None,
                    reuse_existing: true,
                },
                true,
            )
            .await
            .unwrap();
        assert_eq!(standalone_sub.project.id, front2.id);
        assert!(
            service
                .create_thread_in_directory(command(front1.id), Some(linked.to_str().unwrap()))
                .await
                .is_err()
        );
        assert!(
            service
                .create_thread_in_directory(command(p1.id), Some(clone.to_str().unwrap()))
                .await
                .is_err()
        );
        assert!(
            service
                .create_thread_in_directory(
                    command(front1.id),
                    Some(linked.join("frontend").to_str().unwrap())
                )
                .await
                .is_ok()
        );
        std::fs::rename(&linked, fixture_root.join("temporarily-unavailable")).unwrap();
        let unresolved = service.consolidate_projects().await.unwrap();
        assert_eq!(unresolved.len(), 6);
        assert!(unresolved.iter().any(|p| p.id == p2.id));
        let preserved = service.get_thread(thread.id).await.unwrap().thread;
        assert_eq!(preserved.project_id, Some(p2.id));
        assert_eq!(
            preserved.working_directory.as_deref(),
            Some(linked.to_str().unwrap())
        );
        assert!(matches!(
            service.thread_directory(&preserved, temp.path()).await,
            Err(ProductError::FolderUnavailable { .. })
        ));
    }
    #[tokio::test]
    async fn expected_checkout_blocks_branch_and_commit_changes_before_thread_storage() {
        let temp = tempfile::tempdir().unwrap();
        let fixture = temp.path().canonicalize().unwrap();
        let repo = fixture.join("repo");
        initialize(&repo);
        let service = ProductService::new(
            SqliteProductStore::open(fixture.join("product.db"))
                .await
                .unwrap(),
            false,
        );
        let project = service
            .create_project(CreateProjectCommand {
                path: repo.to_str().unwrap().into(),
                name: None,
                reuse_existing: true,
            })
            .await
            .unwrap()
            .project;
        let expected: ExpectedCheckout =
            serde_json::from_value(checkout_context(&repo).await.unwrap().unwrap()).unwrap();
        let mut equivalent = expected.clone();
        equivalent.repository_identity = format!("{}/../.git", repo.join(".git").display());
        equivalent.checkout_root = format!("{}/.", repo.display());
        verify_checkout(&repo, &equivalent).await.unwrap();
        git(&repo, &["checkout", "-q", "-b", "changed"]);
        let result = service
            .create_thread_with_expected_checkout(
                command(project.id),
                Some(repo.to_str().unwrap()),
                Some("draft"),
                Some(&expected),
            )
            .await;
        assert!(matches!(result, Err(ProductError::CheckoutChanged { .. })));
        assert!(service.list_threads().await.unwrap().is_empty());
        let current: ExpectedCheckout =
            serde_json::from_value(checkout_context(&repo).await.unwrap().unwrap()).unwrap();
        let (thread, created) = service
            .create_thread_with_expected_checkout(
                command(project.id),
                Some(repo.to_str().unwrap()),
                Some("draft"),
                Some(&current),
            )
            .await
            .unwrap();
        assert!(created);
        assert_eq!(
            thread.checkout_context.as_ref().unwrap()["branch"],
            "changed"
        );
        git(
            &repo,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "second",
            ],
        );
        assert!(matches!(
            service
                .create_thread_with_expected_checkout(
                    command(project.id),
                    Some(repo.to_str().unwrap()),
                    Some("second"),
                    Some(&current)
                )
                .await,
            Err(ProductError::CheckoutChanged { .. })
        ));
        assert_eq!(service.list_threads().await.unwrap().len(), 1);
        assert!(matches!(
            service.verify_expected_checkout(&thread, &current).await,
            Err(ProductError::CheckoutChanged { .. })
        ));
        git(&repo, &["checkout", "-q", "--detach", "HEAD"]);
        let detached: ExpectedCheckout =
            serde_json::from_value(checkout_context(&repo).await.unwrap().unwrap()).unwrap();
        assert!(detached.branch.is_none());
        assert!(
            service
                .create_thread_with_expected_checkout(
                    command(project.id),
                    Some(repo.to_str().unwrap()),
                    Some("detached"),
                    Some(&detached)
                )
                .await
                .is_ok()
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dangling_git_marker_is_an_inspection_failure_not_a_plain_folder() {
        let temp = tempfile::tempdir().unwrap();
        let plain = temp.path().canonicalize().unwrap().join("folder");
        std::fs::create_dir(&plain).unwrap();
        assert!(git_identity(&plain).await.unwrap().is_none());
        std::os::unix::fs::symlink(plain.join("absent"), plain.join(".git")).unwrap();
        assert!(git_identity(&plain).await.is_err());
    }
    #[tokio::test]
    async fn unregistered_git_pointer_cannot_claim_a_repository_family() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap().join("repo");
        initialize(&root);
        let forged = root.parent().unwrap().join("forged");
        std::fs::create_dir(&forged).unwrap();
        std::fs::write(
            forged.join(".git"),
            format!("gitdir: {}\n", root.join(".git").display()),
        )
        .unwrap();
        assert!(git_identity(&root).await.unwrap().is_some());
        let error = git_identity(&forged).await.err().unwrap();
        assert!(error.to_string().contains("no longer registered"));
        let store = SqliteProductStore::open(temp.path().join("product.db"))
            .await
            .unwrap();
        let service = ProductService::new(store, false);
        let project = service
            .create_project(CreateProjectCommand {
                path: root.to_str().unwrap().into(),
                name: None,
                reuse_existing: true,
            })
            .await
            .unwrap()
            .project;
        assert!(
            service
                .create_thread_in_directory(command(project.id), Some(forged.to_str().unwrap()))
                .await
                .is_err()
        );
        assert!(service.list_threads().await.unwrap().is_empty());
    }
}
