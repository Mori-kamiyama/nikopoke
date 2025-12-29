use crate::core::effects::{apply_effects, apply_events};
use crate::core::events::{BattleEvent, EventTransform};
use crate::core::state::{Action, BattleState, Status};
use crate::core::utils::get_active_creature;
use crate::data::moves::{Effect, MoveData};
use crate::data::type_chart::TypeChart;
use serde_json::{Map, Value};
use std::collections::HashMap;

#[derive(Default)]
pub struct StatusHookResult {
    pub state: Option<BattleState>,
    pub events: Vec<BattleEvent>,
    pub prevent_action: bool,
    pub override_action: Option<Action>,
    pub event_transforms: Vec<EventTransform>,
}

pub struct StatusHookContext<'a> {
    pub rng: &'a mut dyn FnMut() -> f64,
    pub action: Option<&'a Action>,
    pub move_data: Option<&'a MoveData>,
    pub type_chart: &'a TypeChart,
}

pub fn run_status_hooks(
    state: &BattleState,
    player_id: &str,
    hook: &str,
    ctx: StatusHookContext<'_>,
) -> StatusHookResult {
    let Some(active) = get_active_creature(state, player_id) else {
        return StatusHookResult::default();
    };

    let mut working_state = state.clone();
    let mut events = Vec::new();
    let mut prevent_action = false;
    let mut override_action = None;
    let mut event_transforms = Vec::new();

    let statuses = active.statuses.clone();
    for status in statuses {
        let result = match_status(&working_state, player_id, hook, &status, &mut StatusHookContext {
            rng: ctx.rng,
            action: ctx.action,
            move_data: ctx.move_data,
            type_chart: ctx.type_chart,
        });
        if let Some(next) = result.state {
            working_state = next;
        }
        events.extend(result.events);
        if result.prevent_action {
            prevent_action = true;
        }
        if result.override_action.is_some() {
            override_action = result.override_action;
        }
        event_transforms.extend(result.event_transforms);
    }

    StatusHookResult {
        state: Some(working_state),
        events,
        prevent_action,
        override_action,
        event_transforms,
    }
}

pub fn run_field_hooks(
    state: &BattleState,
    hook: &str,
    ctx: StatusHookContext<'_>,
) -> StatusHookResult {
    let mut working_state = state.clone();
    let mut events = Vec::new();
    let mut event_transforms = Vec::new();

    for effect in &state.field.global {
        let result = match_field_effect(&working_state, hook, effect.id.as_str(), effect, &mut StatusHookContext {
            rng: ctx.rng,
            action: ctx.action,
            move_data: ctx.move_data,
            type_chart: ctx.type_chart,
        });
        if let Some(next) = result.state {
            working_state = next;
        }
        events.extend(result.events);
        event_transforms.extend(result.event_transforms);
    }

    StatusHookResult {
        state: Some(working_state),
        events,
        prevent_action: false,
        override_action: None,
        event_transforms,
    }
}

fn match_field_effect(
    state: &BattleState,
    hook: &str,
    status_id: &str,
    status: &crate::core::state::FieldEffect,
    ctx: &mut StatusHookContext<'_>,
) -> StatusHookResult {
    let pseudo_status = Status {
        id: status_id.to_string(),
        remaining_turns: status.remaining_turns,
        data: status.data.clone(),
    };
    match_status(state, "", hook, &pseudo_status, ctx)
}

fn match_status(
    state: &BattleState,
    player_id: &str,
    hook: &str,
    status: &Status,
    ctx: &mut StatusHookContext<'_>,
) -> StatusHookResult {
    match status.id.as_str() {
        "burn" => match hook {
            "onTurnEnd" => {
                let active = get_active_creature(state, player_id).unwrap();
                let damage = (active.max_hp / 16).max(1);
                StatusHookResult {
                    events: vec![
                        BattleEvent::Damage {
                            target_id: player_id.to_string(),
                            amount: damage,
                            meta: Map::new(),
                        },
                        BattleEvent::Log {
                            message: format!("{} is hurt by its burn!", active.name),
                            meta: Map::new(),
                        },
                    ],
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "poison" => match hook {
            "onTurnEnd" => {
                let active = get_active_creature(state, player_id).unwrap();
                let damage = (active.max_hp / 8).max(1);
                StatusHookResult {
                    events: vec![
                        BattleEvent::Damage {
                            target_id: player_id.to_string(),
                            amount: damage,
                            meta: Map::new(),
                        },
                        BattleEvent::Log {
                            message: format!("{} is hurt by poison!", active.name),
                            meta: Map::new(),
                        },
                    ],
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "paralysis" => match hook {
            "onBeforeAction" => {
                if (ctx.rng)() < 0.25 {
                    StatusHookResult {
                        prevent_action: true,
                        events: vec![BattleEvent::Log {
                            message: "It is fully paralyzed!".to_string(),
                            meta: Map::new(),
                        }],
                        ..Default::default()
                    }
                } else {
                    StatusHookResult::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "sleep" => match hook {
            "onBeforeAction" => {
                let active = get_active_creature(state, player_id).unwrap();
                StatusHookResult {
                    prevent_action: true,
                    events: vec![BattleEvent::Log {
                        message: format!("{} is fast asleep.", active.name),
                        meta: Map::new(),
                    }],
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "freeze" => match hook {
            "onBeforeAction" => {
                let active = get_active_creature(state, player_id).unwrap();
                if (ctx.rng)() < 0.2 {
                    StatusHookResult {
                        events: vec![
                            BattleEvent::RemoveStatus {
                                target_id: player_id.to_string(),
                                status_id: "freeze".to_string(),
                                meta: Map::new(),
                            },
                            BattleEvent::Log {
                                message: format!("{} thawed out!", active.name),
                                meta: Map::new(),
                            },
                        ],
                        ..Default::default()
                    }
                } else {
                    StatusHookResult {
                        prevent_action: true,
                        events: vec![BattleEvent::Log {
                            message: format!("{} is frozen solid!", active.name),
                            meta: Map::new(),
                        }],
                        ..Default::default()
                    }
                }
            }
            _ => StatusHookResult::default(),
        },
        "confusion" => match hook {
            "onBeforeAction" => {
                let active = get_active_creature(state, player_id).unwrap();
                if (ctx.rng)() < 0.33 {
                    let damage = ((active.max_hp as f32) * 0.1).floor() as i32;
                    StatusHookResult {
                        prevent_action: true,
                        events: vec![
                            BattleEvent::Log {
                                message: format!("{} hurt itself in its confusion!", active.name),
                                meta: Map::new(),
                            },
                            BattleEvent::Damage {
                                target_id: player_id.to_string(),
                                amount: damage.max(1),
                                meta: Map::new(),
                            },
                        ],
                        ..Default::default()
                    }
                } else {
                    StatusHookResult::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "flinch" => match hook {
            "onBeforeAction" => StatusHookResult {
                prevent_action: true,
                events: vec![BattleEvent::Log {
                    message: "It flinched!".to_string(),
                    meta: Map::new(),
                }],
                ..Default::default()
            },
            _ => StatusHookResult::default(),
        },
        "protect" => match hook {
            "onEventTransform" => {
                let active = get_active_creature(state, player_id).unwrap();
                let mut transforms = Vec::new();
                let types = ["damage", "apply_status", "modify_stage"];
                for t in types {
                    transforms.push(EventTransform {
                        transform_type: "replace_event".to_string(),
                        from: Some(t.to_string()),
                        target_type: None,
                        target_id: Some(player_id.to_string()),
                        except_source_id: Some(player_id.to_string()),
                        require_absent_meta: Some("bypassProtect".to_string()),
                        to: vec![BattleEvent::Log {
                            message: format!("{} protected itself!", active.name),
                            meta: Map::new(),
                        }],
                        priority: 0,
                    });
                }
                StatusHookResult {
                    event_transforms: transforms,
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "substitute" => match hook {
            "onEventTransform" => {
                let active = get_active_creature(state, player_id).unwrap();
                let mut transforms = Vec::new();
                let types = ["apply_status", "modify_stage"];
                for t in types {
                    transforms.push(EventTransform {
                        transform_type: "replace_event".to_string(),
                        from: Some(t.to_string()),
                        target_type: None,
                        target_id: Some(player_id.to_string()),
                        except_source_id: Some(player_id.to_string()),
                        require_absent_meta: Some("bypassSubstitute".to_string()),
                        to: vec![BattleEvent::Log {
                            message: format!("{}'s substitute took the hit!", active.name),
                            meta: Map::new(),
                        }],
                        priority: 0,
                    });
                }
                StatusHookResult {
                    event_transforms: transforms,
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "lock_move" => match hook {
            "onBeforeAction" => {
                let data_mode = status.data.get("mode").and_then(|v| v.as_str());
                let mut target_move = status
                    .data
                    .get("moveId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if data_mode == Some("force_last_move") && target_move.is_none() {
                    let active = get_active_creature(state, player_id).unwrap();
                    if let Some(Value::String(m)) = active.volatile_data.get("lastMove") {
                        target_move = Some(m.clone());
                    } else {
                        target_move = find_last_move_from_history(state, player_id);
                    }
                }

                if let Some(move_id) = target_move {
                    if data_mode == Some("force_specific") || data_mode == Some("force_last_move") {
                        if let Some(action) = ctx.action {
                            let mut new_action = action.clone();
                            new_action.move_id = Some(move_id.clone());
                            let active = get_active_creature(state, player_id).unwrap();
                            let message = if data_mode == Some("force_last_move") {
                                format!("{} is locked into {}!", active.name, move_id)
                            } else {
                                format!("{} must use {}!", active.name, move_id)
                            };
                            return StatusHookResult {
                                override_action: Some(new_action),
                                events: vec![BattleEvent::Log {
                                    message,
                                    meta: Map::new(),
                                }],
                                ..Default::default()
                            };
                        }
                    }
                }
                StatusHookResult::default()
            }
            _ => StatusHookResult::default(),
        },
        "disable_move" => match hook {
            "onBeforeAction" => {
                let move_id = status.data.get("moveId").and_then(|v| v.as_str());
                if let (Some(move_id), Some(action)) = (move_id, ctx.action) {
                    if action.move_id.as_deref() == Some(move_id) {
                        return StatusHookResult {
                            prevent_action: true,
                            events: vec![BattleEvent::Log {
                                message: format!("{} cannot use {}!", get_active_creature(state, player_id).unwrap().name, move_id),
                                meta: Map::new(),
                            }],
                            ..Default::default()
                        };
                    }
                }
                StatusHookResult::default()
            }
            _ => StatusHookResult::default(),
        },
        "encore" => match hook {
            "onBeforeAction" => {
                let move_id = status.data.get("moveId").and_then(|v| v.as_str());
                if let (Some(move_id), Some(action)) = (move_id, ctx.action) {
                    if action.move_id.as_deref() != Some(move_id) {
                        let mut new_action = action.clone();
                        new_action.move_id = Some(move_id.to_string());
                        return StatusHookResult {
                            override_action: Some(new_action),
                            events: vec![BattleEvent::Log {
                                message: format!("{} received an encore!", get_active_creature(state, player_id).unwrap().name),
                                meta: Map::new(),
                            }],
                            ..Default::default()
                        };
                    }
                }
                StatusHookResult::default()
            }
            _ => StatusHookResult::default(),
        },
        "taunt" => match hook {
            "onBeforeAction" => {
                if let Some(move_data) = ctx.move_data {
                    if move_data.category.as_deref() == Some("status") {
                        return StatusHookResult {
                            prevent_action: true,
                            events: vec![BattleEvent::Log {
                                message: format!("{} can't use {} after the taunt!", get_active_creature(state, player_id).unwrap().name, move_data.name.clone().unwrap_or_else(|| move_data.id.clone())),
                                meta: Map::new(),
                            }],
                            ..Default::default()
                        };
                    }
                }
                StatusHookResult::default()
            }
            _ => StatusHookResult::default(),
        },
        "leech_seed" => match hook {
            "onTurnEnd" => {
                let source_id = status.data.get("sourceId").and_then(|v| v.as_str());
                let Some(source_id) = source_id else { return StatusHookResult::default(); };
                let source = get_active_creature(state, source_id);
                if source.is_none() || source.unwrap().hp <= 0 {
                    return StatusHookResult::default();
                }
                let active = get_active_creature(state, player_id).unwrap();
                let damage = (active.max_hp / 8).max(1);
                StatusHookResult {
                    events: vec![
                        BattleEvent::Log {
                            message: format!("{}'s health is sapped by Leech Seed!", active.name),
                            meta: Map::new(),
                        },
                        BattleEvent::Damage {
                            target_id: player_id.to_string(),
                            amount: damage,
                            meta: Map::new(),
                        },
                        BattleEvent::Damage {
                            target_id: source_id.to_string(),
                            amount: -damage,
                            meta: Map::new(),
                        },
                    ],
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "curse" => match hook {
            "onTurnEnd" => {
                let active = get_active_creature(state, player_id).unwrap();
                let damage = (active.max_hp / 4).max(1);
                StatusHookResult {
                    events: vec![
                        BattleEvent::Log {
                            message: format!("{} is afflicted by the curse!", active.name),
                            meta: Map::new(),
                        },
                        BattleEvent::Damage {
                            target_id: player_id.to_string(),
                            amount: damage,
                            meta: Map::new(),
                        },
                    ],
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "yawn" => match hook {
            "onTurnEnd" => {
                let turns = status
                    .data
                    .get("turns")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(1);
                if turns > 0 {
                    let mut new_state = state.clone();
                    if let Some(player) = new_state.players.iter_mut().find(|p| p.id == player_id) {
                        if let Some(active) = player.team.get_mut(player.active_slot) {
                            if let Some(status_mut) = active.statuses.iter_mut().find(|s| s.id == "yawn") {
                                status_mut
                                    .data
                                    .insert("turns".to_string(), Value::Number((turns - 1).into()));
                            }
                        }
                    }
                    return StatusHookResult {
                        state: Some(new_state),
                        events: vec![BattleEvent::Log {
                            message: format!("{} is getting drowsy...", get_active_creature(state, player_id).unwrap().name),
                            meta: Map::new(),
                        }],
                        ..Default::default()
                    };
                }
                let min = 2;
                let max = 4;
                let duration = min + (((ctx.rng)() * ((max - min + 1) as f64)).floor() as i32);
                StatusHookResult {
                    events: vec![
                        BattleEvent::RemoveStatus {
                            target_id: player_id.to_string(),
                            status_id: "yawn".to_string(),
                            meta: Map::new(),
                        },
                        BattleEvent::ApplyStatus {
                            target_id: player_id.to_string(),
                            status_id: "sleep".to_string(),
                            duration: Some(duration),
                            stack: false,
                            data: HashMap::new(),
                            meta: Map::new(),
                        },
                    ],
                    ..Default::default()
                }
            }
            _ => StatusHookResult::default(),
        },
        "charging_solar_beam" => match hook {
            "onBeforeAction" => {
                let data_mode = status.data.get("mode").and_then(|v| v.as_str());
                let move_id = status.data.get("moveId").and_then(|v| v.as_str());
                if data_mode == Some("force_specific") {
                    if let (Some(move_id), Some(action)) = (move_id, ctx.action) {
                        let mut new_action = action.clone();
                        new_action.move_id = Some(move_id.to_string());
                        return StatusHookResult {
                            override_action: Some(new_action),
                            ..Default::default()
                        };
                    }
                }
                StatusHookResult::default()
            }
            _ => StatusHookResult::default(),
        },
        "delayed_effect" => match hook {
            "onTurnStart" | "onTurnEnd" => handle_delayed(state, player_id, status, hook, ctx),
            _ => StatusHookResult::default(),
        },
        "over_time_effect" => match hook {
            "onTurnEnd" => handle_over_time(state, player_id, status, hook, ctx),
            _ => StatusHookResult::default(),
        },
        _ => StatusHookResult::default(),
    }
}

fn handle_delayed(
    state: &BattleState,
    player_id: &str,
    status: &Status,
    hook: &str,
    ctx: &mut StatusHookContext<'_>,
) -> StatusHookResult {
    let timing = status.data.get("timing").and_then(|v| v.as_str()).unwrap_or("turn_end");
    let trigger_turn = status.data.get("triggerTurn").and_then(|v| v.as_i64()).unwrap_or(i64::MAX);
    if (state.turn as i64) < trigger_turn {
        return StatusHookResult::default();
    }
    if !matches_timing(hook, timing) {
        return StatusHookResult::default();
    }

    let target_id = status.data.get("targetId").and_then(|v| v.as_str()).unwrap_or(player_id);
    let attacker_id = status.data.get("sourceId").and_then(|v| v.as_str()).unwrap_or(player_id);

    let effects = effects_from_status(status);
    let mut effect_ctx = crate::core::effects::EffectContext {
        attacker_player_id: attacker_id.to_string(),
        target_player_id: target_id.to_string(),
        move_data: None,
        rng: ctx.rng,
        turn: state.turn,
        type_chart: ctx.type_chart,
        bypass_protect: false,
        ignore_immunity: false,
        bypass_substitute: false,
        ignore_substitute: false,
        is_sound: false,
    };
    let events = apply_effects(state, &effects, &mut effect_ctx);
    let new_state = apply_events(state, &events);

    StatusHookResult {
        state: Some(new_state),
        ..Default::default()
    }
}

fn handle_over_time(
    state: &BattleState,
    player_id: &str,
    status: &Status,
    hook: &str,
    ctx: &mut StatusHookContext<'_>,
) -> StatusHookResult {
    let timing = status.data.get("timing").and_then(|v| v.as_str()).unwrap_or("turn_end");
    if !matches_timing(hook, timing) {
        return StatusHookResult::default();
    }

    let target_id = status.data.get("targetId").and_then(|v| v.as_str()).unwrap_or(player_id);
    let attacker_id = status.data.get("sourceId").and_then(|v| v.as_str()).unwrap_or(player_id);
    let effects = effects_from_status(status);
    let mut effect_ctx = crate::core::effects::EffectContext {
        attacker_player_id: attacker_id.to_string(),
        target_player_id: target_id.to_string(),
        move_data: None,
        rng: ctx.rng,
        turn: state.turn,
        type_chart: ctx.type_chart,
        bypass_protect: false,
        ignore_immunity: false,
        bypass_substitute: false,
        ignore_substitute: false,
        is_sound: false,
    };
    let events = apply_effects(state, &effects, &mut effect_ctx);
    let new_state = apply_events(state, &events);

    StatusHookResult {
        state: Some(new_state),
        ..Default::default()
    }
}

fn matches_timing(hook: &str, timing: &str) -> bool {
    match timing.to_lowercase().as_str() {
        "turn_start" => hook == "onTurnStart",
        "turn_end" => hook == "onTurnEnd",
        _ => true,
    }
}

fn effects_from_status(status: &Status) -> Vec<Effect> {
    match status.data.get("effects") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| serde_json::from_value(item.clone()).ok())
            .collect(),
        _ => Vec::new(),
    }
}

pub fn tick_statuses(state: &BattleState) -> BattleState {
    let mut next = state.clone();
    for player in &mut next.players {
        if let Some(active) = player.team.get_mut(player.active_slot) {
            for status in &mut active.statuses {
                if let Some(turns) = status.remaining_turns {
                    status.remaining_turns = Some(turns - 1);
                }
            }
            active
                .statuses
                .retain(|s| s.remaining_turns.map(|t| t > 0).unwrap_or(true));
        }
    }
    next
}

pub fn tick_field_effects(state: &BattleState) -> BattleState {
    let mut next = state.clone();
    for effect in &mut next.field.global {
        if let Some(turns) = effect.remaining_turns {
            effect.remaining_turns = Some(turns - 1);
        }
    }
    next.field
        .global
        .retain(|e| e.remaining_turns.map(|t| t > 0).unwrap_or(true));
    next
}

fn find_last_move_from_history(state: &BattleState, player_id: &str) -> Option<String> {
            if let Some(history) = &state.history {
                for turn in history.turns.iter().rev() {
                    for action in turn.actions.iter().rev() {
                        if action.player_id == player_id {
                            if let Some(move_id) = &action.move_id {
                                return Some(move_id.clone());
                            }
                        }
                    }
                }
            }
            None
        }
        
        
