//! Image icons share the ordinary icon field without changing legacy symbol strings.
use crate::GraphError;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageIcon {
    pub kind: String,
    pub asset_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub framing: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub digest_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
}
pub fn image_icon(value: &str) -> Option<ImageIcon> {
    serde_json::from_str(value).ok()
}
pub fn canonical_icon(value: &str) -> Result<String, GraphError> {
    if let Some(icon) = image_icon(value) {
        if icon.kind != "image"
            || icon.asset_id.trim().is_empty()
            || icon
                .fit
                .as_deref()
                .is_some_and(|v| !["contain", "cover"].contains(&v))
            || icon
                .framing
                .as_deref()
                .is_some_and(|v| !["none", "circle", "rounded"].contains(&v))
        {
            return Err(GraphError::validation(
                "invalid_image_icon",
                "icon",
                "Use a registered image asset with contain/cover fit and none/circle/rounded framing.",
            ));
        }
        return serde_json::to_string(&icon).map_err(|e| GraphError::Internal(e.to_string()));
    }
    super::resolve_icon_name(value)
        .map(str::to_owned)
        .ok_or_else(|| {
            GraphError::validation(
                "unsupported_icon",
                "icon",
                "Use a supported symbol such as compass or box, a registered image icon, or discover icons through graph.icons.discover.",
            )
        })
}
pub mod wire {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(value: &str, serializer: S) -> Result<S::Ok, S::Error> {
        if let Some(icon) = super::image_icon(value) {
            serde::Serialize::serialize(&icon, serializer)
        } else {
            serializer.serialize_str(value)
        }
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
        let value = serde_json::Value::deserialize(deserializer)?;
        match value {
            serde_json::Value::String(v) => Ok(v),
            serde_json::Value::Object(_) => {
                serde_json::to_string(&value).map_err(serde::de::Error::custom)
            }
            _ => Err(serde::de::Error::custom(
                "icon must be a symbol string or typed image reference",
            )),
        }
    }
}
pub mod optional_wire {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(
        value: &Option<String>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match value {
            Some(v) => super::wire::serialize(v, serializer),
            None => serializer.serialize_none(),
        }
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<String>, D::Error> {
        let value = Option::<serde_json::Value>::deserialize(deserializer)?;
        value
            .map(|v| match v {
                serde_json::Value::String(s) => Ok(s),
                serde_json::Value::Object(_) => {
                    serde_json::to_string(&v).map_err(serde::de::Error::custom)
                }
                _ => Err(serde::de::Error::custom("invalid icon")),
            })
            .transpose()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wire_preserves_symbols_and_typed_images() {
        let symbol: crate::NodeDraft = serde_json::from_value(
            serde_json::json!({"clientKey":"n","icon":"compass","title":"t","detail":"d"}),
        )
        .unwrap();
        assert_eq!(symbol.validate().unwrap(), "compass");
        let image: crate::NodeDraft = serde_json::from_value(serde_json::json!({"clientKey":"n","icon":{"kind":"image","assetId":"coral","fit":"cover","framing":"rounded"},"title":"t","detail":"d"})).unwrap();
        let value = image.validate().unwrap();
        assert_eq!(image_icon(&value).unwrap().asset_id, "coral");
    }
    #[test]
    fn invalid_fit_and_external_url_are_repairable() {
        assert!(canonical_icon(r#"{"kind":"image","assetId":"coral","fit":"stretch"}"#).is_err());
        assert!(
            canonical_icon(
                r#"{"kind":"image","assetId":"coral","url":"https://example.com/a.png"}"#
            )
            .is_err()
        );
    }
}
