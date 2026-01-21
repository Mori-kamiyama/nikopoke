use crate::core::abilities::{modify_stages_with_ability, run_ability_check_hook, AbilityCheckContext};
use crate::core::state::{BattleState, Status, StatStages};
use serde_json::{Map, Value};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub enum BattleEvent {
    Log {
        message: String,
        meta: Map<String, Value>,
    },
    Damage {
        target_id: String,
        amount: i32,
        meta: Map<String, Value>,
    },
    ApplyStatus {
        target_id: String,
        status_id: String,
        duration: Option<i32>,
        stack: bool,
        data: HashMap<String, Value>,
        meta: Map<String, Value>,
    },
    RemoveStatus {
        target_id: String,
        status_id: String,
        meta: Map<String, Value>,
    },
    ReplaceStatus {
        target_id: String,
        from: String,
        to: String,
        duration: Option<i32>,
        data: HashMap<String, Value>,
        meta: Map<String, Value>,
    },
    ModifyStage {
        target_id: String,
        stages: HashMap<String, i32>,
        clamp: bool,
        fail_if_no_change: bool,
        show_event: bool,
        meta: Map<String, Value>,
    },
    ClearStages {
        target_id: String,
        show_event: bool,
        meta: Map<String, Value>,
    },
    ResetStages {
        target_id: String,
        show_event: bool,
        meta: Map<String, Value>,
    },
    CureAllStatus {
        target_id: String,
        meta: Map<String, Value>,
    },
    ApplyFieldStatus {
        status_id: String,
        duration: Option<i32>,
        stack: bool,
        data: HashMap<String, Value>,
        meta: Map<String, Value>,
    },
    RemoveFieldStatus {
        status_id: String,
        meta: Map<String, Value>,
    },
    Switch {
        player_id: String,
        slot: usize,
    },
    RandomMove {
        pool: String,
        meta: Map<String, Value>,
    },
    SetVolatile {
        target_id: String,
        key: String,
        value: Value,
    },
}

#[derive(Clone, Debug)]
pub struct EventTransform {
    pub transform_type: String,
    pub from: Option<String>,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub except_source_id: Option<String>,
    pub require_absent_meta: Option<String>,
    pub to: Vec<BattleEvent>,
    pub priority: i32,
}

impl Default for EventTransform {
    fn default() -> Self {
        Self {
            transform_type: String::new(),
            from: None,
            target_type: None,
            target_id: None,
            except_source_id: None,
            require_absent_meta: None,
            to: Vec::new(),
            priority: 0,
        }
    }
}

pub fn event_type(event: &BattleEvent) -> &str {
    match event {
        BattleEvent::Log { .. } => "log",
        BattleEvent::Damage { .. } => "damage",
        BattleEvent::ApplyStatus { .. } => "apply_status",
        BattleEvent::RemoveStatus { .. } => "remove_status",
        BattleEvent::ReplaceStatus { .. } => "replace_status",
        BattleEvent::ModifyStage { .. } => "modify_stage",
        BattleEvent::ClearStages { .. } => "clear_stages",
        BattleEvent::ResetStages { .. } => "reset_stages",
        BattleEvent::CureAllStatus { .. } => "cure_all_status",
        BattleEvent::ApplyFieldStatus { .. } => "apply_field_status",
        BattleEvent::RemoveFieldStatus { .. } => "remove_field_status",
        BattleEvent::Switch { .. } => "switch",
        BattleEvent::RandomMove { .. } => "random_move",
        BattleEvent::SetVolatile { .. } => "set_volatile",
    }
}

pub fn apply_event(state: &BattleState, event: &BattleEvent) -> BattleState {
    let mut next = state.clone();
    match event {
        BattleEvent::Log { message, .. } => {
            next.log.push(message.clone());
        }
        BattleEvent::Damage {
            target_id, amount, ..
        } => {
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    if *amount > 0 {
                        let meta = event_meta(event);
                        let bypass_substitute = meta
                            .and_then(|meta| meta_get_bool(meta, "bypassSubstitute"))
                            .unwrap_or(false);
                        let source = meta.and_then(|meta| meta_get_string(meta, "source"));
                        let is_self = source.as_deref() == Some(target_id.as_str());
                        if !bypass_substitute && !is_self {
                            if let Some(index) = active.statuses.iter().position(|s| s.id == "substitute") {
                                let current = active.statuses[index]
                                    .data
                                    .get("hp")
                                    .and_then(|v| v.as_i64())
                                    .map(|v| v as i32)
                                    .unwrap_or_else(|| substitute_hp_from_max(active.max_hp));
                                let remaining = current - *amount;
                                if remaining > 0 {
                                    active.statuses[index]
                                        .data
                                        .insert("hp".to_string(), Value::Number(remaining.into()));
                                    next.log.push(format!("{}の みがわりが 攻撃を 受けた！", active.name));
                                } else {
                                    active.statuses.remove(index);
                                    next.log.push(format!("{}の みがわりは 壊れてしまった！", active.name));
                                }
                                return next;
                            }
                        }
                    }
                    let new_hp = active.hp - *amount;
                    active.hp = new_hp.clamp(0, active.max_hp);
                    if *amount > 0 {
                        next.log.push(format!("{}は {}ダメージ 受けた！", active.name, amount));
                    } else if *amount < 0 {
                        next.log.push(format!("{}の HPが {}回復した！", active.name, -amount));
                    } else {
                        next.log.push(format!("{}には 効かないようだ……", active.name));
                    }
                    if active.hp <= 0 {
                        next.log.push(format!("{}は たおれた！", active.name));
                        player.last_fainted_ability = active.ability.clone();
                        if !active.statuses.iter().any(|s| s.id == "pending_switch") {
                            active.statuses.push(Status {
                                id: "pending_switch".to_string(),
                                remaining_turns: None,
                                data: HashMap::new(),
                            });
                        }
                    }
                }
            }
        }
        BattleEvent::ApplyStatus {
            target_id,
            status_id,
            duration,
            stack,
            data,
            ..
        } => {
            if run_ability_check_hook(
                &next,
                target_id,
                "onCheckStatusImmunity",
                AbilityCheckContext {
                    status_id: Some(status_id),
                    r#type: None,
                    target_id: None,
                    action: None,
                },
                false,
            ) {
                if let Some(player) = next.players.iter().find(|p| p.id == *target_id) {
                    if let Some(active) = player.team.get(player.active_slot) {
                        next.log
                            .push(format!("{}には {}は 効かない！", active.name, status_id));
                    }
                }
                return next;
            }
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    if status_id == "item" || status_id == "berry" {
                        if let Some(Value::String(item_id)) = data.get("itemId") {
                            active.item = Some(item_id.clone());
                        }
                    }
                    if !stack {
                        if let Some(_existing) = active.statuses.iter().find(|s| s.id == *status_id) {
                            next.log.push(format!("{}は すでに {}状態だ！", active.name, status_id));
                            return next;
                        }
                    }
                    active.statuses.push(Status {
                        id: status_id.clone(),
                        remaining_turns: *duration,
                        data: data.clone(),
                    });
                }
            }
        }
        BattleEvent::RemoveStatus {
            target_id, status_id, ..
        } => {
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    active.statuses.retain(|s| s.id != *status_id);
                    if status_id == "item" || status_id == "berry" {
                        active.item = None;
                    }
                }
            }
        }
        BattleEvent::ReplaceStatus {
            target_id,
            from,
            to,
            duration,
            data,
            ..
        } => {
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    if !active.statuses.iter().any(|s| s.id == *from) {
                        return next;
                    }
                    active.statuses.retain(|s| s.id != *from);
                    active.statuses.push(Status {
                        id: to.clone(),
                        remaining_turns: *duration,
                        data: data.clone(),
                    });
                }
            }
        }
        BattleEvent::ModifyStage {
            target_id,
            stages,
            clamp,
            fail_if_no_change,
            ..
        } => {
            let adjusted = modify_stages_with_ability(&next, target_id, stages);
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    let mut changed = false;
                    for (key, delta) in adjusted {
                        let stage_ref = stage_ref_mut(&mut active.stages, &key);
                        if let Some(stage_ref) = stage_ref {
                            let mut new_val = *stage_ref + delta;
                            if *clamp {
                                new_val = new_val.clamp(-6, 6);
                            }
                            if new_val != *stage_ref {
                                *stage_ref = new_val;
                                changed = true;
                            }
                        }
                    }
                    if *fail_if_no_change && !changed {
                        // noop
                    }
                }
            }
        }
        BattleEvent::ClearStages { target_id, .. } | BattleEvent::ResetStages { target_id, .. } => {
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    active.stages = StatStages::default();
                }
            }
        }
        BattleEvent::CureAllStatus { target_id, .. } => {
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    active.statuses.clear();
                }
            }
        }
        BattleEvent::ApplyFieldStatus {
            status_id,
            duration,
            stack,
            data,
            ..
        } => {
            if !*stack {
                next.field.global.retain(|e| e.id != *status_id);
            }
            next.field.global.push(crate::core::state::FieldEffect {
                id: status_id.clone(),
                remaining_turns: *duration,
                data: data.clone(),
            });
        }
        BattleEvent::RemoveFieldStatus { status_id, .. } => {
            next.field.global.retain(|e| e.id != *status_id);
        }
        BattleEvent::Switch { player_id, slot } => {
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *player_id) {
                if *slot < player.team.len() {
                    if let Some(outgoing) = player.team.get_mut(player.active_slot) {
                        outgoing.stages = StatStages::default();
                        // Non-volatile statuses that persist on switch (sleep is explicitly NOT included - cured on switch)
                        let non_volatile = ["burn", "poison", "toxic", "paralysis", "freeze"];
                        outgoing.statuses.retain(|s| non_volatile.contains(&s.id.as_str()));
                        outgoing.ability_data.clear();
                        outgoing.volatile_data.clear();
                    }
                    player.active_slot = *slot;
                    if let Some(incoming) = player.team.get_mut(player.active_slot) {
                        incoming.statuses.retain(|s| s.id != "pending_switch");
                        next.log
                            .push(format!("{}は {}を 繰り出した！", player.name, incoming.name));
                    }
                }
            }
        }
        BattleEvent::RandomMove { .. } => {
            // Placeholder: move selection handled at action level.
        }
        BattleEvent::SetVolatile { target_id, key, value } => {
            if let Some(player) = next.players.iter_mut().find(|p| p.id == *target_id) {
                if let Some(active) = player.team.get_mut(player.active_slot) {
                    active.volatile_data.insert(key.clone(), value.clone());
                }
            }
        }
    }
    next
}

fn stage_ref_mut<'a>(stages: &'a mut StatStages, key: &str) -> Option<&'a mut i32> {
    match key {
        "atk" => Some(&mut stages.atk),
        "def" => Some(&mut stages.def),
        "spa" => Some(&mut stages.spa),
        "spd" => Some(&mut stages.spd),
        "spe" => Some(&mut stages.spe),
        "accuracy" | "acc" => Some(&mut stages.accuracy),
        "evasion" | "eva" => Some(&mut stages.evasion),
        "crit" => Some(&mut stages.crit),
        _ => None,
    }
}

pub fn meta_with_move_source(move_id: Option<&str>, source: Option<&str>) -> Map<String, Value> {
    let mut meta = Map::new();
    if let Some(move_id) = move_id {
        meta.insert("moveId".to_string(), Value::String(move_id.to_string()));
    }
    if let Some(source) = source {
        meta.insert("source".to_string(), Value::String(source.to_string()));
    }
    meta
}

pub fn meta_get_string(meta: &Map<String, Value>, key: &str) -> Option<String> {
    meta.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

pub fn meta_get_bool(meta: &Map<String, Value>, key: &str) -> Option<bool> {
    meta.get(key).and_then(|v| v.as_bool())
}

pub fn meta_get_i32(meta: &Map<String, Value>, key: &str) -> Option<i32> {
    meta.get(key).and_then(|v| v.as_i64()).map(|v| v as i32)
}

fn substitute_hp_from_max(max_hp: i32) -> i32 {
    let hp = ((max_hp as f64) * 0.25).floor() as i32;
    hp.max(1)
}

fn event_meta(event: &BattleEvent) -> Option<&Map<String, Value>> {
    match event {
        BattleEvent::Damage { meta, .. }
        | BattleEvent::ApplyStatus { meta, .. }
        | BattleEvent::RemoveStatus { meta, .. }
        | BattleEvent::ReplaceStatus { meta, .. }
        | BattleEvent::ModifyStage { meta, .. }
        | BattleEvent::ClearStages { meta, .. }
        | BattleEvent::ResetStages { meta, .. }
        | BattleEvent::CureAllStatus { meta, .. }
        | BattleEvent::ApplyFieldStatus { meta, .. }
        | BattleEvent::RemoveFieldStatus { meta, .. }
        | BattleEvent::RandomMove { meta, .. } => Some(meta),
        _ => None,
    }
}
