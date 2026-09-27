//! Product-owned, revocable browser review authority. No control cookie enters a browser.
use super::{AnnotationSession, ApiState, error::ApiError};
use crate::product::ThreadId;
use axum::{
    Json,
    extract::{Request, State},
    http::{HeaderMap, Method, StatusCode},
    middleware::Next,
    response::Response,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Clone)]
pub(crate) struct ReviewSession {
    pub(crate) thread_ids: HashSet<i64>,
    project_ids: HashSet<i64>,
    context: Value,
    pub(crate) annotation: Option<AnnotationSession>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RegisterRequest {
    token: String,
    context: Value,
    author: Option<Author>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Author {
    id: String,
    display_name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RevokeRequest {
    token: String,
}

pub(crate) fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}
pub(crate) fn session(state: &ApiState, headers: &HeaderMap) -> Option<ReviewSession> {
    state
        .review_sessions
        .lock()
        .expect("review sessions poisoned")
        .get(bearer(headers)?)
        .cloned()
}
pub(super) async fn register(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<RegisterRequest>,
) -> Result<StatusCode, ApiError> {
    if !state.annotations_enabled || !state.authenticator.is_control(&headers) {
        return Err(ApiError::unauthorized());
    }
    if request.token.len() != 64
        || !request.token.bytes().all(|b| b.is_ascii_hexdigit())
        || state.authenticator.is_reserved_token(&request.token)
    {
        return Err(ApiError::invalid(
            "review token must be a distinct 256-bit hex capability",
        ));
    }
    if request.context.get("readOnly") != Some(&Value::Bool(true)) {
        return Err(ApiError::invalid("review context must be read-only"));
    }
    let cases = request
        .context
        .get("cases")
        .and_then(Value::as_array)
        .ok_or_else(|| ApiError::invalid("review cases are required"))?;
    let mut thread_ids = HashSet::new();
    let mut project_ids = HashSet::new();
    for case in cases {
        for id in case
            .get("threadIds")
            .and_then(Value::as_array)
            .ok_or_else(|| ApiError::invalid("case thread IDs required"))?
        {
            let id = id
                .as_i64()
                .ok_or_else(|| ApiError::invalid("invalid review thread"))?;
            thread_ids.insert(id);
            if thread_ids.len() > 256 {
                return Err(ApiError::invalid("too many review threads"));
            }
            let thread = state.product.get_thread(ThreadId::try_from(id)?).await?;
            if let Some(project_id) = thread.thread.project_id {
                project_ids.insert(project_id.value());
            }
        }
    }
    if thread_ids.is_empty() {
        return Err(ApiError::invalid("review requires a thread"));
    }
    let annotation = request
        .author
        .map(|author| {
            if author.id.trim().is_empty()
                || author.display_name.trim().is_empty()
                || author.id.len() > 256
                || author.display_name.len() > 256
            {
                return Err(ApiError::invalid("invalid review author"));
            }
            Ok(AnnotationSession {
                thread_ids: thread_ids.clone(),
                author_id: author.id,
                author_display_name: author.display_name,
            })
        })
        .transpose()?;
    let mut sessions = state
        .review_sessions
        .lock()
        .expect("review sessions poisoned");
    if sessions.len() >= 256 || sessions.contains_key(&request.token) {
        return Err(ApiError::invalid(
            "review capacity exhausted or token already registered",
        ));
    }
    sessions.insert(
        request.token,
        ReviewSession {
            thread_ids,
            project_ids,
            context: request.context,
            annotation,
        },
    );
    Ok(StatusCode::CREATED)
}
pub(super) async fn revoke(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<RevokeRequest>,
) -> Result<StatusCode, ApiError> {
    if !state.authenticator.is_control(&headers) {
        return Err(ApiError::unauthorized());
    }
    state
        .review_sessions
        .lock()
        .expect("review sessions poisoned")
        .remove(&request.token);
    Ok(StatusCode::NO_CONTENT)
}
pub(super) async fn context(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        session(&state, &headers)
            .ok_or_else(ApiError::unauthorized)?
            .context,
    ))
}

pub(super) async fn guard(
    State(state): State<ApiState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let mut review_response = request.uri().query().is_some_and(|query| {
        url::form_urlencoded::parse(query.as_bytes())
            .any(|(key, value)| key == "review" && value == "1")
    });
    if request.headers().contains_key("authorization") {
        if let Some(scope) = session(&state, request.headers()) {
            review_response = true;
            request.headers_mut().remove("cookie");
            if request
                .headers()
                .get("sec-fetch-site")
                .and_then(|v| v.to_str().ok())
                == Some("cross-site")
            {
                return Err(ApiError::forbidden("cross-site review request"));
            }
            if let Some(origin) = request.headers().get("origin") {
                let host = request
                    .headers()
                    .get("host")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                if origin.to_str().ok() != Some(format!("http://{host}").as_str()) {
                    return Err(ApiError::forbidden("foreign review origin"));
                }
            }
            let path = request.uri().path();
            let parts: Vec<_> = path.split('/').collect();
            let get = request.method() == Method::GET;
            let annotation = matches!(
                parts.as_slice(),
                ["", "api", "threads", _, "annotations"]
                    | [
                        "",
                        "api",
                        "threads",
                        _,
                        "annotations",
                        _,
                        "revisions" | "retract"
                    ]
            );
            let thread_route = matches!(
                parts.as_slice(),
                ["", "api", "threads", _]
                    | ["", "api", "threads", _, "annotations"]
                    | ["", "api", "threads", _, "interactions", _, "layers", _]
                    | [
                        "",
                        "api",
                        "threads",
                        _,
                        "interactions",
                        _,
                        "actions",
                        _,
                        "destination"
                    ]
                    | [
                        "",
                        "api",
                        "threads",
                        _,
                        "interactions",
                        _,
                        "nodes",
                        _,
                        "detail-assets",
                        _
                    ]
            );
            let permitted = if thread_route || annotation {
                parts[3]
                    .parse::<i64>()
                    .ok()
                    .is_some_and(|id| scope.thread_ids.contains(&id))
                    && ((get && thread_route)
                        || (request.method() == Method::POST
                            && annotation
                            && scope.annotation.is_some()))
            } else if matches!(parts.as_slice(), ["", "api", "projects", _, "environment"]) {
                get && parts[3]
                    .parse::<i64>()
                    .ok()
                    .is_some_and(|id| scope.project_ids.contains(&id))
            } else {
                get && matches!(
                    path,
                    "/api/state"
                        | "/api/review-context"
                        | "/api/model-settings"
                        | "/api/permission-profiles"
                )
            };
            if !permitted {
                return Err(ApiError::forbidden("outside review session scope"));
            }
            request.extensions_mut().insert(scope);
        } else if (request.uri().path() == "/api/completions"
            || request.uri().path().starts_with("/api/completions/"))
            && bearer(request.headers())
                .and_then(|token| state.completion_brokers.resolve(token))
                .is_some()
        {
            // Native recursion has its own execution-scoped authority. Its handlers
            // still validate the grant and child ownership; never inherit cookies.
            request.headers_mut().remove("cookie");
        } else if !(request.uri().path().starts_with("/api/internal/")
            && state
                .authenticator
                .authorize_provider_publish(request.headers())
                .is_ok())
        {
            return Err(ApiError::unauthorized());
        }
    }
    let mut response = next.run(request).await;
    if review_response {
        response
            .headers_mut()
            .insert("cache-control", "no-store".parse().unwrap());
        response
            .headers_mut()
            .insert("referrer-policy", "no-referrer".parse().unwrap());
        response.headers_mut().insert(
            "content-security-policy",
            "frame-ancestors 'none'".parse().unwrap(),
        );
        response
            .headers_mut()
            .insert("x-content-type-options", "nosniff".parse().unwrap());
    }
    Ok(response)
}
