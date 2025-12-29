use crate::core::state::{CreatureState, StatStages};
use crate::data::learnsets::LearnsetDatabase;
use crate::data::moves::MoveDatabase;
use crate::data::species::SpeciesData;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

static CREATURE_COUNTER: AtomicUsize = AtomicUsize::new(1);

#[derive(Clone, Debug)]
pub struct CreateCreatureOptions {
    pub moves: Option<Vec<String>>,
    pub ability: Option<String>,
    pub name: Option<String>,
    pub level: Option<u32>,
    pub item: Option<String>,
}

impl Default for CreateCreatureOptions {
    fn default() -> Self {
        Self {
            moves: None,
            ability: None,
            name: None,
            level: None,
            item: None,
        }
    }
}

pub fn calc_stat(base: i32, is_hp: bool, level: i32, iv: i32, ev: i32) -> i32 {
    if is_hp {
        ((base * 2 + iv + (ev / 4)) * level) / 100 + level + 10
    } else {
        ((base * 2 + iv + (ev / 4)) * level) / 100 + 5
    }
}

pub fn validate_moves(
    species_id: &str,
    requested_moves: &[String],
    learnsets: &LearnsetDatabase,
    move_db: &MoveDatabase,
) -> Result<Vec<String>, String> {
    if requested_moves.is_empty() {
        return Ok(Vec::new());
    }
    let learnable = learnsets
        .get(species_id)
        .ok_or_else(|| format!("No learnset found for species '{}'.", species_id))?;

    let unknown: Vec<String> = requested_moves
        .iter()
        .filter(|id| move_db.get(id.as_str()).is_none())
        .cloned()
        .collect();
    if !unknown.is_empty() {
        return Err(format!(
            "Unknown move id(s) for species '{}': {}",
            species_id,
            unknown.join(", ")
        ));
    }

    let learnable_set: std::collections::HashSet<&String> = learnable.iter().collect();
    let invalid: Vec<String> = requested_moves
        .iter()
        .filter(|id| !learnable_set.contains(id))
        .cloned()
        .collect();
    if !invalid.is_empty() {
        return Err(format!(
            "Move(s) not allowed for species '{}': {}",
            species_id,
            invalid.join(", ")
        ));
    }

    Ok(requested_moves.to_vec())
}

pub fn create_creature(
    species: &SpeciesData,
    options: CreateCreatureOptions,
    learnsets: &LearnsetDatabase,
    move_db: &MoveDatabase,
) -> Result<CreatureState, String> {
    let level = options.level.unwrap_or(50);
    let iv = 31;
    let ev = 0;
    let stats = &species.base_stats;

    let max_hp = calc_stat(stats.hp, true, level as i32, iv, ev);
    let attack = calc_stat(stats.atk, false, level as i32, iv, ev);
    let defense = calc_stat(stats.def, false, level as i32, iv, ev);
    let sp_attack = calc_stat(stats.spa, false, level as i32, iv, ev);
    let sp_defense = calc_stat(stats.spd, false, level as i32, iv, ev);
    let speed = calc_stat(stats.spe, false, level as i32, iv, ev);

    let moves = validate_moves(
        species.id.as_str(),
        options.moves.as_deref().unwrap_or(&[]),
        learnsets,
        move_db,
    )?;

    let ability = options
        .ability
        .or_else(|| species.abilities.get(0).cloned())
        .unwrap_or_else(|| "none".to_string());

    let unique = CREATURE_COUNTER.fetch_add(1, Ordering::Relaxed);
    Ok(CreatureState {
        id: format!("{}_{}", species.id, unique),
        name: options.name.unwrap_or_else(|| species.name.clone()),
        species_id: species.id.clone(),
        level,
        types: species.types.clone(),
        moves,
        ability: Some(ability),
        item: options.item,
        hp: max_hp,
        max_hp,
        stages: StatStages::default(),
        statuses: Vec::new(),
        move_pp: HashMap::new(),
        ability_data: HashMap::new(),
        volatile_data: HashMap::new(),
        attack,
        defense,
        sp_attack,
        sp_defense,
        speed,
    })
}
