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
    /// New preparations require response navigation in addition to exact authority.
    #[serde(rename = "2")]
    V2 {
        enabled: bool,
        permissions: Vec<InteractionPermission>,
    },
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
            }
            | Self::V2 {
                enabled,
                permissions,
            } => *enabled && permissions.contains(permission),
        }
    }
    /// Obligation is frozen by version, never inferred from the current process gate.
    pub(crate) fn required_response_sources(&self) -> Vec<NodeId> {
        let Self::V2 {
            enabled: true,
            permissions,
        } = self
        else {
            return Vec::new();
        };
        let mut nodes = permissions
            .iter()
            .filter_map(|permission| match permission {
                InteractionPermission::NavigateAdd { node_id } => Some(*node_id),
                _ => None,
            })
            .collect::<Vec<_>>();
        nodes.sort();
        nodes.dedup();
        nodes
    }

    pub(crate) fn enabled(&self) -> bool {
        match self {
            Self::V1 { enabled, .. } | Self::V2 { enabled, .. } => *enabled,
        }
    }
}
