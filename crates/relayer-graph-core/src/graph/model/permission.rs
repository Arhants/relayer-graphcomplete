use crate::{ActionId, NodeId};
use serde::{Deserialize, Serialize};

/// Closed permission grammar. Only trusted graph preparation stores this description.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum InteractionPermission {
    #[serde(rename = "invoke.resolve")]
    InvokeResolve {
        #[serde(rename = "actionId")]
        action_id: ActionId,
    },
    #[serde(rename = "navigate.add")]
    NavigateAdd {
        #[serde(rename = "nodeId")]
        node_id: NodeId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "version", deny_unknown_fields)]
pub enum InteractionPermissions {
    #[serde(rename = "1")]
    V1 {
        enabled: bool,
        permissions: Vec<InteractionPermission>,
    },
}

impl InteractionPermissions {
    pub(crate) fn permits(&self, permission: &InteractionPermission) -> bool {
        match self {
            Self::V1 {
                enabled,
                permissions,
            } => *enabled && permissions.contains(permission),
        }
    }
    pub(crate) fn enabled(&self) -> bool {
        match self {
            Self::V1 { enabled, .. } => *enabled,
        }
    }
}
