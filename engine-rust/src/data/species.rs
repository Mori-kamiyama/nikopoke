use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BaseStats {
    pub hp: i32,
    pub atk: i32,
    pub def: i32,
    pub spa: i32,
    pub spd: i32,
    pub spe: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpeciesData {
    pub id: String,
    pub name: String,
    #[serde(default, alias = "type")]
    pub types: Vec<String>,
    #[serde(rename = "baseStats")]
    pub base_stats: BaseStats,
    #[serde(default)]
    pub abilities: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct SpeciesDatabase {
    species: HashMap<String, SpeciesData>,
}

impl SpeciesDatabase {
    pub fn new() -> Self {
        Self {
            species: HashMap::new(),
        }
    }

    pub fn insert(&mut self, data: SpeciesData) {
        self.species.insert(data.id.clone(), data);
    }

    pub fn get(&self, species_id: &str) -> Option<&SpeciesData> {
        self.species.get(species_id)
    }

    pub fn as_map(&self) -> &HashMap<String, SpeciesData> {
        &self.species
    }

    pub fn load_from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        let value: Value = serde_json::from_str(json)?;
        let map_value = if let Some(obj) = value.as_object() {
            if let Some(inner) = obj.get("species") {
                inner.clone()
            } else {
                let mut merged = Map::new();
                for (key, val) in obj {
                    if key.ends_with("Species") {
                        if let Some(nested) = val.as_object() {
                            for (id, data) in nested {
                                merged.insert(id.clone(), data.clone());
                            }
                        }
                    }
                }
                if !merged.is_empty() {
                    Value::Object(merged)
                } else {
                    value.clone()
                }
            }
        } else {
            value.clone()
        };
        let map: HashMap<String, SpeciesData> = serde_json::from_value(map_value)?;
        let mut db = Self::new();
        for (_, data) in map {
            db.insert(data);
        }
        Ok(db)
    }

    pub fn load_default() -> Result<Self, serde_json::Error> {
        const DEFAULT_SPECIES_JSON: &str = include_str!("../../data/species.json");
        Self::load_from_json_str(DEFAULT_SPECIES_JSON)
    }
}
