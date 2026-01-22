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

    pub fn load_from_yaml_str(yaml: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // Direct parse - learnsets.yaml is a simple map of species_id -> Vec<move_id>
        let map: HashMap<String, Vec<String>> = serde_yaml::from_str(yaml)?;
        let mut db = Self::new();
        for (species_id, moves) in map {
            db.insert(species_id, moves);
        }
        Ok(db)
    }

    pub fn load_default() -> Result<Self, Box<dyn std::error::Error>> {
        const DEFAULT_LEARNSETS_YAML: &str = include_str!("../../data/learnsets.yaml");
        Self::load_from_yaml_str(DEFAULT_LEARNSETS_YAML)
    }
}
