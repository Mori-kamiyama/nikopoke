use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug, Default)]
pub struct LearnsetDatabase {
    learnsets: HashMap<String, Vec<String>>,
}

impl LearnsetDatabase {
    pub fn new() -> Self {
        Self {
            learnsets: HashMap::new(),
        }
    }

    pub fn insert(&mut self, species_id: String, moves: Vec<String>) {
        self.learnsets.insert(species_id, moves);
    }

    pub fn get(&self, species_id: &str) -> Option<&Vec<String>> {
        self.learnsets.get(species_id)
    }

    pub fn as_map(&self) -> &HashMap<String, Vec<String>> {
        &self.learnsets
    }

    pub fn load_from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        let value: Value = serde_json::from_str(json)?;
        let map_value = if let Some(obj) = value.as_object() {
            if let Some(inner) = obj.get("learnsets") {
                inner.clone()
            } else {
                value.clone()
            }
        } else {
            value.clone()
        };
        let map: HashMap<String, Vec<String>> = serde_json::from_value(map_value)?;
        let mut db = Self::new();
        for (species_id, moves) in map {
            db.insert(species_id, moves);
        }
        Ok(db)
    }

    pub fn load_default() -> Result<Self, serde_json::Error> {
        const DEFAULT_LEARNSETS_JSON: &str = include_str!("../../data/learnsets.json");
        Self::load_from_json_str(DEFAULT_LEARNSETS_JSON)
    }
}
