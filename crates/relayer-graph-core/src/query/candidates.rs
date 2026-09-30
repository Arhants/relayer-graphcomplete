//! Engine-neutral candidate-source ranking. Sources supply authorized records;
//! catalogs never become accepted conversation Content or acquire graph authority.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextCandidate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub use_cases: Vec<String>,
    pub kind: String,
    pub icon: Value,
}

pub trait CandidateSource {
    fn candidates(&self) -> &[TextCandidate];
}
impl CandidateSource for Vec<TextCandidate> {
    fn candidates(&self) -> &[TextCandidate] {
        self
    }
}
