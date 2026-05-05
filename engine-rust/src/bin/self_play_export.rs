use engine_rust::ai::get_best_move_minimax;
use engine_rust::core::battle::{is_battle_over, step_battle, BattleOptions};
use engine_rust::core::factory::{create_creature, CreateCreatureOptions};
use engine_rust::core::state::{
    create_battle_state, Action, ActionType, BattleState, CreatureState, PlayerState,
};
use engine_rust::data::learnsets::LearnsetDatabase;
use engine_rust::data::moves::MoveDatabase;
use engine_rust::data::species::{SpeciesData, SpeciesDatabase};
use engine_rust::data::type_chart::TypeChart;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::Path;

const INPUT_SIZE: usize = 44;
const HIDDEN1_SIZE: usize = 64;
const HIDDEN2_SIZE: usize = 32;
const OUTPUT_SIZE: usize = 6;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct MlpWeights {
    w1: Vec<Vec<f64>>,
    b1: Vec<f64>,
    w2: Vec<Vec<f64>>,
    b2: Vec<f64>,
    w3: Vec<Vec<f64>>,
    b3: Vec<f64>,
}

#[derive(Debug)]
struct Config {
    weight_a: String,
    weight_b: String,
    games: usize,
    seed: u64,
}

#[derive(Serialize)]
struct Results {
    wins_a: usize,
    wins_b: usize,
    draws: usize,
}

fn main() {
    let config = parse_args();
    let weights_a = load_weights_or_random(&config.weight_a, 0);
    let weights_b = load_weights_or_random(&config.weight_b, 1);

    let species_db = SpeciesDatabase::load_default().expect("failed to load species");
    let move_db = MoveDatabase::load_default().unwrap_or_else(|_| MoveDatabase::minimal());
    let learnset_db = LearnsetDatabase::load_default().unwrap_or_else(|_| LearnsetDatabase::new());
    let type_chart = TypeChart::new();

    let mut results = Results {
        wins_a: 0,
        wins_b: 0,
        draws: 0,
    };

    for game_index in 0..config.games {
        let outcome = play_game(
            &weights_a,
            &weights_b,
            &species_db,
            &move_db,
            &learnset_db,
            &type_chart,
            config.seed + game_index as u64,
        );

        match outcome {
            GameOutcome::A => results.wins_a += 1,
            GameOutcome::B => results.wins_b += 1,
            GameOutcome::Draw => results.draws += 1,
        }
    }

    println!(
        "{}",
        serde_json::to_string(&results).expect("failed to serialize results")
    );
}

#[derive(Clone, Copy)]
enum GameOutcome {
    A,
    B,
    Draw,
}

fn parse_args() -> Config {
    let mut weight_a = String::new();
    let mut weight_b = String::new();
    let mut games = 20usize;
    let mut seed = 42u64;

    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--weight-a" => {
                if let Some(value) = args.get(i + 1) {
                    weight_a = value.clone();
                    i += 1;
                }
            }
            "--weight-b" => {
                if let Some(value) = args.get(i + 1) {
                    weight_b = value.clone();
                    i += 1;
                }
            }
            "--games" => {
                if let Some(value) = args.get(i + 1) {
                    games = value.parse().unwrap_or(20);
                    i += 1;
                }
            }
            "--seed" => {
                if let Some(value) = args.get(i + 1) {
                    seed = value.parse().unwrap_or(42);
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    Config {
        weight_a,
        weight_b,
        games,
        seed,
    }
}

fn play_game(
    weights_a: &MlpWeights,
    weights_b: &MlpWeights,
    species_db: &SpeciesDatabase,
    move_db: &MoveDatabase,
    learnset_db: &LearnsetDatabase,
    type_chart: &TypeChart,
    seed: u64,
) -> GameOutcome {
    let mut rng = make_rng(seed);
    let (team_a, team_b) = create_random_teams(species_db, move_db, learnset_db, &mut rng);

    let mut state = create_battle_state(vec![
        PlayerState {
            id: "a".to_string(),
            name: "MLP A".to_string(),
            team: team_a,
            active_slot: 0,
            last_fainted_ability: None,
        },
        PlayerState {
            id: "b".to_string(),
            name: "MLP B".to_string(),
            team: team_b,
            active_slot: 0,
            last_fainted_ability: None,
        },
    ]);

    while !is_battle_over(&state) {
        if state.turn > 200 {
            return GameOutcome::Draw;
        }

        let mut actions = Vec::new();
        push_action(
            &state,
            "a",
            weights_a,
            move_db,
            type_chart,
            true,
            &mut actions,
        );
        push_action(
            &state,
            "b",
            weights_b,
            move_db,
            type_chart,
            true,
            &mut actions,
        );

        if actions.is_empty() {
            break;
        }

        state = step_battle(
            &state,
            &actions,
            &mut rng,
            BattleOptions {
                record_history: false,
            },
        );
        handle_forced_switches(&mut state, &mut rng);
    }

    winner(&state)
}

fn handle_forced_switches(state: &mut BattleState, rng: &mut impl FnMut() -> f64) {
    loop {
        if is_battle_over(state) {
            return;
        }

        let mut actions = Vec::new();
        if needs_switch(state, "a") {
            if let Some(action) =
                get_best_move_minimax(state, "a", 2).or_else(|| first_switch(state, "a"))
            {
                actions.push(action);
            }
        }
        if needs_switch(state, "b") {
            if let Some(action) =
                get_best_move_minimax(state, "b", 2).or_else(|| first_switch(state, "b"))
            {
                actions.push(action);
            }
        }

        if actions.is_empty() {
            return;
        }

        *state = step_battle(
            state,
            &actions,
            rng,
            BattleOptions {
                record_history: false,
            },
        );
    }
}

fn push_action(
    state: &BattleState,
    player_id: &str,
    weights: &MlpWeights,
    move_db: &MoveDatabase,
    type_chart: &TypeChart,
    minimax_when_forced: bool,
    actions: &mut Vec<Action>,
) {
    let action = if minimax_when_forced && needs_switch(state, player_id) {
        get_best_move_minimax(state, player_id, 2).or_else(|| first_switch(state, player_id))
    } else {
        select_action_mlp(state, player_id, weights, move_db, type_chart)
            .or_else(|| get_best_move_minimax(state, player_id, 1))
            .or_else(|| first_switch(state, player_id))
    };

    if let Some(action) = action {
        actions.push(action);
    }
}

fn create_random_teams(
    species_db: &SpeciesDatabase,
    move_db: &MoveDatabase,
    learnset_db: &LearnsetDatabase,
    rng: &mut impl FnMut() -> f64,
) -> (Vec<CreatureState>, Vec<CreatureState>) {
    let mut species_list: Vec<&SpeciesData> = species_db.as_map().values().collect();
    species_list.sort_by(|a, b| a.id.cmp(&b.id));

    let mut team_a = Vec::new();
    let mut team_b = Vec::new();
    while (team_a.len() < 3 || team_b.len() < 3) && !species_list.is_empty() {
        let for_a = team_a.len() <= team_b.len() && team_a.len() < 3;
        let idx = random_index(species_list.len(), rng);
        let species = species_list.remove(idx);
        let moves = random_moves(&species.id, move_db, learnset_db, rng);
        let prefix = if for_a { "a" } else { "b" };
        let creature = create_creature(
            species,
            CreateCreatureOptions {
                moves: Some(moves),
                name: Some(format!("{}-{}", prefix, species.name)),
                ..Default::default()
            },
            learnset_db,
            move_db,
        )
        .expect("failed to create creature");
        if for_a {
            team_a.push(creature);
        } else {
            team_b.push(creature);
        }
    }
    (team_a, team_b)
}

fn random_moves(
    species_id: &str,
    move_db: &MoveDatabase,
    learnset_db: &LearnsetDatabase,
    rng: &mut impl FnMut() -> f64,
) -> Vec<String> {
    let mut learnable: Vec<String> = learnset_db
        .get(species_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|move_id| move_db.get(move_id).is_some())
        .collect();

    let mut selected = Vec::new();
    while selected.len() < 4 && !learnable.is_empty() {
        let idx = random_index(learnable.len(), rng);
        selected.push(learnable.remove(idx));
    }

    if selected.is_empty() {
        selected.push("tackle".to_string());
    }

    selected
}

fn random_index(len: usize, rng: &mut impl FnMut() -> f64) -> usize {
    ((rng() * len as f64).floor() as usize).min(len.saturating_sub(1))
}

fn select_action_mlp(
    state: &BattleState,
    player_id: &str,
    weights: &MlpWeights,
    move_db: &MoveDatabase,
    type_chart: &TypeChart,
) -> Option<Action> {
    let features = extract_features(state, player_id, move_db, type_chart)?;
    let logits = forward(weights, &features);
    let mask = action_mask(state, player_id, move_db);

    let mut best_idx = None;
    let mut best_value = f64::NEG_INFINITY;
    for (idx, value) in logits.iter().enumerate() {
        if mask.get(idx).copied().unwrap_or(false) && *value > best_value {
            best_value = *value;
            best_idx = Some(idx);
        }
    }

    action_from_slot(state, player_id, best_idx?)
}

fn extract_features(
    state: &BattleState,
    player_id: &str,
    move_db: &MoveDatabase,
    type_chart: &TypeChart,
) -> Option<Vec<f64>> {
    let player = state.players.iter().find(|p| p.id == player_id)?;
    let opponent = state.players.iter().find(|p| p.id != player_id)?;
    let active = player.team.get(player.active_slot)?;
    let opponent_active = opponent.team.get(opponent.active_slot)?;

    let mut features = Vec::with_capacity(INPUT_SIZE);
    append_side_features(&mut features, player);
    append_side_features(&mut features, opponent);

    for slot in 0..4 {
        if let Some(move_id) = active.moves.get(slot) {
            if let Some(move_data) = move_db.get(move_id) {
                let max_pp = move_data.pp.unwrap_or(1).max(1);
                let remaining_pp = active
                    .move_pp
                    .get(move_id)
                    .copied()
                    .unwrap_or(max_pp)
                    .max(0);
                let category = move_data.category.as_deref().unwrap_or("");
                let is_physical = category == "physical";
                let is_special = category == "special";
                let is_status = category == "status";
                let power_norm = if is_physical || is_special {
                    move_data.power.unwrap_or(0) as f64 / 150.0
                } else {
                    0.0
                };
                let type_effectiveness = move_data
                    .move_type
                    .as_deref()
                    .map(|move_type| {
                        type_chart.effectiveness(move_type, &opponent_active.types) as f64 / 4.0
                    })
                    .unwrap_or(0.0);

                features.push(remaining_pp as f64 / max_pp as f64);
                features.push(power_norm);
                features.push(type_effectiveness);
                features.push(if is_physical { 1.0 } else { 0.0 });
                features.push(if is_status { 1.0 } else { 0.0 });
            } else {
                features.extend([0.0; 5]);
            }
        } else {
            features.extend([0.0; 5]);
        }
    }

    Some(features)
}

fn append_side_features(features: &mut Vec<f64>, player: &PlayerState) {
    let Some(active) = player.team.get(player.active_slot) else {
        features.extend([0.0; 12]);
        return;
    };

    let max_hp = active.max_hp.max(1) as f64;
    features.push((active.hp.max(0) as f64 / max_hp).clamp(0.0, 1.0));
    features.push(active.stages.atk as f64 / 6.0);
    features.push(active.stages.def as f64 / 6.0);
    features.push(active.stages.spa as f64 / 6.0);
    features.push(active.stages.spd as f64 / 6.0);
    features.push(active.stages.spe as f64 / 6.0);
    features.push(if has_status(active, &["burn", "burned"]) {
        1.0
    } else {
        0.0
    });
    features.push(if has_status(active, &["sleep", "asleep"]) {
        1.0
    } else {
        0.0
    });
    features.push(
        if has_status(active, &["poison", "toxic", "badly_poisoned"]) {
            1.0
        } else {
            0.0
        },
    );
    features.push(
        if has_status(active, &["paralysis", "paralyze", "paralyzed"]) {
            1.0
        } else {
            0.0
        },
    );

    let alive = player
        .team
        .iter()
        .filter(|creature| creature.hp > 0)
        .count() as f64;
    let hp_sum: f64 = player
        .team
        .iter()
        .map(|creature| {
            let max_hp = creature.max_hp.max(1) as f64;
            (creature.hp.max(0) as f64 / max_hp).clamp(0.0, 1.0)
        })
        .sum();
    features.push(alive / 3.0);
    features.push(hp_sum / 3.0);
}

fn has_status(creature: &CreatureState, ids: &[&str]) -> bool {
    creature
        .statuses
        .iter()
        .any(|status| ids.contains(&status.id.as_str()))
}

fn action_mask(
    state: &BattleState,
    player_id: &str,
    move_db: &MoveDatabase,
) -> [bool; OUTPUT_SIZE] {
    let mut mask = [false; OUTPUT_SIZE];
    let Some(player) = state.players.iter().find(|p| p.id == player_id) else {
        return mask;
    };
    let Some(active) = player.team.get(player.active_slot) else {
        return mask;
    };

    let forced_switch = needs_switch(state, player_id);
    if !forced_switch {
        for (slot, move_id) in active.moves.iter().take(4).enumerate() {
            if move_has_pp(active, move_id, move_db) {
                mask[slot] = true;
            }
        }
    }

    for (bench_slot, _) in bench_slots(player).iter().take(2).enumerate() {
        mask[4 + bench_slot] = true;
    }

    mask
}

fn action_from_slot(state: &BattleState, player_id: &str, slot: usize) -> Option<Action> {
    let player = state.players.iter().find(|p| p.id == player_id)?;
    let opponent_id = state
        .players
        .iter()
        .find(|p| p.id != player_id)
        .map(|p| p.id.clone());
    match slot {
        0..=3 => {
            let active = player.team.get(player.active_slot)?;
            let move_id = active.moves.get(slot)?.clone();
            Some(Action {
                player_id: player_id.to_string(),
                action_type: ActionType::Move,
                move_id: Some(move_id),
                target_id: opponent_id,
                slot: None,
                priority: None,
            })
        }
        4..=5 => {
            let bench = bench_slots(player);
            Some(Action {
                player_id: player_id.to_string(),
                action_type: ActionType::Switch,
                move_id: None,
                target_id: None,
                slot: bench.get(slot - 4).copied(),
                priority: None,
            })
        }
        _ => None,
    }
}

fn needs_switch(state: &BattleState, player_id: &str) -> bool {
    let Some(player) = state.players.iter().find(|p| p.id == player_id) else {
        return true;
    };
    let Some(active) = player.team.get(player.active_slot) else {
        return true;
    };
    active.hp <= 0 || active.statuses.iter().any(|s| s.id == "pending_switch")
}

fn first_switch(state: &BattleState, player_id: &str) -> Option<Action> {
    let player = state.players.iter().find(|p| p.id == player_id)?;
    let slot = bench_slots(player).first().copied()?;
    Some(Action {
        player_id: player_id.to_string(),
        action_type: ActionType::Switch,
        move_id: None,
        target_id: None,
        slot: Some(slot),
        priority: None,
    })
}

fn bench_slots(player: &PlayerState) -> Vec<usize> {
    player
        .team
        .iter()
        .enumerate()
        .filter(|(idx, creature)| *idx != player.active_slot && creature.hp > 0)
        .map(|(idx, _)| idx)
        .collect()
}

fn move_has_pp(active: &CreatureState, move_id: &str, move_db: &MoveDatabase) -> bool {
    let Some(move_data) = move_db.get(move_id) else {
        return false;
    };
    let Some(max_pp) = move_data.pp else {
        return true;
    };
    active.move_pp.get(move_id).copied().unwrap_or(max_pp) > 0
}

fn winner(state: &BattleState) -> GameOutcome {
    let a_alive = state
        .players
        .iter()
        .find(|p| p.id == "a")
        .map(|p| p.team.iter().any(|c| c.hp > 0))
        .unwrap_or(false);
    let b_alive = state
        .players
        .iter()
        .find(|p| p.id == "b")
        .map(|p| p.team.iter().any(|c| c.hp > 0))
        .unwrap_or(false);

    match (a_alive, b_alive) {
        (true, false) => GameOutcome::A,
        (false, true) => GameOutcome::B,
        _ => GameOutcome::Draw,
    }
}

fn forward(weights: &MlpWeights, x: &[f64]) -> Vec<f64> {
    let h1 = relu(mat_vec(&weights.w1, &weights.b1, x));
    let h2 = relu(mat_vec(&weights.w2, &weights.b2, &h1));
    mat_vec(&weights.w3, &weights.b3, &h2)
}

fn mat_vec(w: &[Vec<f64>], b: &[f64], x: &[f64]) -> Vec<f64> {
    w.iter()
        .enumerate()
        .map(|(row_idx, row)| {
            let bias = b.get(row_idx).copied().unwrap_or(0.0);
            row.iter()
                .zip(x.iter())
                .fold(bias, |sum, (weight, value)| sum + weight * value)
        })
        .collect()
}

fn relu(values: Vec<f64>) -> Vec<f64> {
    values.into_iter().map(|value| value.max(0.0)).collect()
}

fn load_weights_or_random(path: &str, seed: u64) -> MlpWeights {
    if !path.is_empty() && Path::new(path).exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(weights) = serde_json::from_str::<MlpWeights>(&content) {
                return weights;
            }
        }
        eprintln!("failed to load weights at {path}; using random weights");
    }
    random_weights(seed)
}

fn random_weights(seed: u64) -> MlpWeights {
    let mut rng = make_rng(seed);
    MlpWeights {
        w1: random_matrix(HIDDEN1_SIZE, INPUT_SIZE, &mut rng),
        b1: vec![0.0; HIDDEN1_SIZE],
        w2: random_matrix(HIDDEN2_SIZE, HIDDEN1_SIZE, &mut rng),
        b2: vec![0.0; HIDDEN2_SIZE],
        w3: random_matrix(OUTPUT_SIZE, HIDDEN2_SIZE, &mut rng),
        b3: vec![0.0; OUTPUT_SIZE],
    }
}

fn random_matrix(rows: usize, cols: usize, rng: &mut impl FnMut() -> f64) -> Vec<Vec<f64>> {
    (0..rows)
        .map(|_| (0..cols).map(|_| (rng() * 2.0 - 1.0) * 0.1).collect())
        .collect()
}

fn make_rng(seed: u64) -> impl FnMut() -> f64 {
    let mut state = seed;
    move || {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        ((state >> 33) as f64) / (u32::MAX as f64)
    }
}
