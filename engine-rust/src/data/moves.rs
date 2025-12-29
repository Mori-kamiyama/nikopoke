use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MoveData {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub move_type: Option<String>,
    pub category: Option<String>,
    pub pp: Option<i32>,
    pub power: Option<i32>,
    pub accuracy: Option<f32>,
    pub priority: Option<i32>,
    #[serde(default)]
    pub effects: Vec<Effect>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "critRate")]
    pub crit_rate: Option<i32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Effect {
    #[serde(rename = "type")]
    pub effect_type: String,
    #[serde(flatten)]
    pub data: Map<String, Value>,
}

#[derive(Clone, Debug)]
pub struct MoveDatabase {
    moves: HashMap<String, MoveData>,
}

impl MoveDatabase {
    pub fn new() -> Self {
        Self {
            moves: HashMap::new(),
        }
    }

    pub fn minimal() -> Self {
        let mut db = Self::new();
        db.insert(MoveData {
            id: "tackle".to_string(),
            name: Some("Tackle".to_string()),
            move_type: Some("normal".to_string()),
            category: Some("physical".to_string()),
            pp: Some(35),
            power: Some(40),
            accuracy: Some(1.0),
            priority: Some(0),
            effects: Vec::new(),
            tags: Vec::new(),
            crit_rate: None,
        });
        db.insert(MoveData {
            id: "ember".to_string(),
            name: Some("Ember".to_string()),
            move_type: Some("fire".to_string()),
            category: Some("special".to_string()),
            pp: Some(25),
            power: Some(40),
            accuracy: Some(1.0),
            priority: Some(0),
            effects: Vec::new(),
            tags: Vec::new(),
            crit_rate: None,
        });
        db.insert(MoveData {
            id: "water_gun".to_string(),
            name: Some("Water Gun".to_string()),
            move_type: Some("water".to_string()),
            category: Some("special".to_string()),
            pp: Some(25),
            power: Some(40),
            accuracy: Some(1.0),
            priority: Some(0),
            effects: Vec::new(),
            tags: Vec::new(),
            crit_rate: None,
        });
        db.insert(MoveData {
            id: "vine_whip".to_string(),
            name: Some("Vine Whip".to_string()),
            move_type: Some("grass".to_string()),
            category: Some("physical".to_string()),
            pp: Some(25),
            power: Some(45),
            accuracy: Some(1.0),
            priority: Some(0),
            effects: Vec::new(),
            tags: Vec::new(),
            crit_rate: None,
        });
        db.insert(MoveData {
            id: "thunder_shock".to_string(),
            name: Some("Thunder Shock".to_string()),
            move_type: Some("electric".to_string()),
            category: Some("special".to_string()),
            pp: Some(30),
            power: Some(40),
            accuracy: Some(1.0),
            priority: Some(0),
            effects: Vec::new(),
            tags: Vec::new(),
            crit_rate: None,
        });
        db.insert(MoveData {
            id: "growl".to_string(),
            name: Some("Growl".to_string()),
            move_type: Some("normal".to_string()),
            category: Some("status".to_string()),
            pp: Some(40),
            power: Some(0),
            accuracy: Some(1.0),
            priority: Some(0),
            effects: Vec::new(),
            tags: Vec::new(),
            crit_rate: None,
        });
        db
    }

    pub fn load_default() -> Result<Self, serde_json::Error> {
        const DEFAULT_MOVES_JSON: &str = include_str!("../../data/moves.json");
        Self::load_from_json_str(DEFAULT_MOVES_JSON)
    }

    pub fn insert(&mut self, move_data: MoveData) {
        self.moves.insert(move_data.id.clone(), move_data);
    }

    pub fn get(&self, move_id: &str) -> Option<&MoveData> {
        self.moves.get(move_id)
    }

    pub fn as_map(&self) -> &HashMap<String, MoveData> {
        &self.moves
    }

    pub fn load_from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        let map_result: Result<HashMap<String, MoveData>, _> = serde_json::from_str(json);
        if let Ok(map) = map_result {
            let mut db = Self::new();
            for (_, move_data) in map {
                db.insert(move_data);
            }
            return Ok(db);
        }

        let vec_result: Result<Vec<MoveData>, _> = serde_json::from_str(json);
        let mut db = Self::new();
        for move_data in vec_result? {
            db.insert(move_data);
        }
        Ok(db)
    }

    pub fn load_from_json_file(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let content = fs::read_to_string(path)?;
        let db = Self::load_from_json_str(&content)?;
        Ok(db)
    }
}

impl Default for MoveDatabase {
    fn default() -> Self {
        Self::load_default().unwrap_or_else(|_| Self::minimal())
    }
}
