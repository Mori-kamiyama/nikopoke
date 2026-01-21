use crate::core::abilities::{
    run_ability_check_hook, run_ability_value_hook, AbilityCheckContext, AbilityValueContext, WeatherKind,
};
use crate::core::events::{
    apply_event, meta_with_move_source, BattleEvent,
};
use crate::core::state::BattleState;
use crate::core::utils::{get_active_creature, stage_multiplier};
use crate::data::moves::{Effect, MoveData};
use crate::data::type_chart::TypeChart;
use serde_json::{Map, Value};
use std::collections::HashMap;

pub struct EffectContext<'a> {
    pub attacker_player_id: String,
    pub target_player_id: String,
    pub move_data: Option<&'a MoveData>,
    pub rng: &'a mut dyn FnMut() -> f64,
    pub turn: u32,
    pub type_chart: &'a TypeChart,
    pub bypass_protect: bool,
    pub ignore_immunity: bool,
    pub bypass_substitute: bool,
    pub ignore_substitute: bool,
    pub is_sound: bool,
}

pub fn apply_effects(state: &BattleState, effects: &[Effect], ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    apply_move_tag_flags(ctx);
    apply_effect_flags(ctx, effects);
    let mut events = Vec::new();
    for effect in effects {
        match effect.effect_type.as_str() {
            "modify_damage" => apply_modify_damage(&mut events, effect),
            "crit" => apply_force_crit(&mut events, effect),
            _ => events.extend(apply_effect(state, effect, ctx)),
        }
    }
    apply_meta_flags(&mut events, ctx);
    events
}

pub fn apply_events(state: &BattleState, events: &[BattleEvent]) -> BattleState {
    let mut next = state.clone();
    for event in events {
        next = apply_event(&next, event);
    }
    next
}

fn apply_effect(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let effect_type = effect.effect_type.as_str();
    match effect_type {
        "protect" => apply_protect(state, effect, ctx),
        "damage" => apply_damage(state, effect, ctx),
        "speed_based_damage" => apply_speed_based_damage(state, effect, ctx),
        "apply_status" => apply_status(state, effect, ctx),
        "remove_status" => apply_remove_status(effect, ctx),
        "replace_status" => apply_replace_status(effect, ctx),
        "modify_stage" => apply_modify_stage(effect, ctx),
        "clear_stages" => apply_clear_stages(effect, ctx),
        "reset_stages" => apply_reset_stages(effect, ctx),
        "disable_move" => apply_disable_move(effect, ctx),
        "damage_ratio" => apply_damage_ratio(state, effect, ctx),
        "delay" => apply_delay(effect, ctx),
        "over_time" => apply_over_time(effect, ctx),
        "chance" => apply_chance(state, effect, ctx),
        "repeat" => apply_repeat(state, effect, ctx),
        "conditional" => apply_conditional(state, effect, ctx),
        "log" => apply_log(effect, ctx),
        "apply_field_status" => apply_field_status(effect, ctx),
        "remove_field_status" => apply_remove_field_status(effect, ctx),
        "random_move" => apply_random_move(effect, ctx),
        "apply_item" => apply_apply_item(state, effect, ctx),
        "remove_item" => apply_remove_item(state, effect, ctx),
        "consume_item" => apply_consume_item(state, effect, ctx),
        "ohko" => apply_ohko(state, effect, ctx),
        "cure_all_status" => apply_cure_all_status(effect, ctx),
        "self_switch" => apply_self_switch(ctx),
        "force_switch" => apply_force_switch(state, effect, ctx),
        "replace_pokemon" => apply_replace_pokemon(ctx),
        "lock_move" => apply_lock_move(effect, ctx),
        "run_away" => apply_run_away(),
        "bypass_protect"
        | "bypass_substitute"
        | "ignore_immunity"
        | "ignore_substitute"
        | "sound" => Vec::new(),
        "manual" => apply_manual_effect(effect, ctx),
        _ => Vec::new(),
    }
}

fn apply_manual_effect(effect: &Effect, ctx: &EffectContext<'_>) -> Vec<BattleEvent> {
    let reason = effect.data.get("manualReason").and_then(|v| v.as_str()).unwrap_or("");
    if reason.contains("Switching") {
        return vec![BattleEvent::ApplyStatus {
            target_id: ctx.attacker_player_id.clone(),
            status_id: "pending_switch".to_string(),
            duration: None,
            stack: false,
            data: HashMap::new(),
            meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
        }];
    }
    Vec::new()
}

fn apply_protect(state: &BattleState, _effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let Some(attacker) = get_active_creature(state, &ctx.attacker_player_id) else {
        return Vec::new();
    };

    let success_count = attacker
        .volatile_data
        .get("protectSuccessCount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let mut chance = 1.0;
    for _ in 0..success_count {
        chance *= 0.5;
    }

    if (ctx.rng)() > chance {
        return vec![
            BattleEvent::Log {
                message: format!("{}の まもりは 失敗した！", attacker.name),
                meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
            },
            BattleEvent::SetVolatile {
                target_id: ctx.attacker_player_id.clone(),
                key: "protectSuccessCount".to_string(),
                value: Value::Number(0.into()),
            },
        ];
    }

    vec![
        BattleEvent::SetVolatile {
            target_id: ctx.attacker_player_id.clone(),
            key: "protectSuccessCount".to_string(),
            value: Value::Number((success_count + 1).into()),
        },
        BattleEvent::ApplyStatus {
        target_id: ctx.attacker_player_id.clone(),
        status_id: "protect".to_string(),
        duration: Some(1),
        stack: false,
        data: HashMap::new(),
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_damage(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let Some(attacker) = get_active_creature(state, &ctx.attacker_player_id) else {
        return Vec::new();
    };
    let Some(target) = get_active_creature(state, &ctx.target_player_id) else {
        return Vec::new();
    };

    let accuracy = value_f64(effect.data.get("accuracy")).unwrap_or(1.0);
    let move_category = get_move_category(ctx.move_data);
    let accuracy = run_ability_value_hook(
        state,
        &ctx.attacker_player_id,
        "onModifyAccuracy",
        accuracy as f32,
        AbilityValueContext {
            move_data: ctx.move_data,
            category: move_category.as_deref(),
            target: Some(target),
            weather: None,
            turn: ctx.turn,
            stages: None,
        },
    ) as f64;

    if (ctx.rng)() > accuracy {
        return vec![BattleEvent::Log {
            message: "しかし はずれた！".to_string(),
            meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
        }];
    }

    let power = value_i32(effect.data.get("power")).unwrap_or(0);
    let attacker_id = ctx.attacker_player_id.clone();
    let target_id = ctx.target_player_id.clone();
    
    // Pass false for is_secondary_hit, let calc_damage handle crit logic
    let (amount, is_crit) = calc_damage(power, state, &attacker_id, &target_id, ctx, false);
    
    let mut events = Vec::new();

    if amount > 0 {
        if is_crit {
            events.push(BattleEvent::Log {
                message: "急所に あたった！".to_string(),
                meta: Map::new(),
            });
        }

        if let Some(move_type) = ctx.move_data.and_then(|m| m.move_type.as_deref()) {
            let eff = ctx.type_chart.effectiveness(move_type, &target.types);
            if eff > 1.0 {
                events.push(BattleEvent::Log {
                    message: "効果は 抜群だ！".to_string(),
                    meta: Map::new(),
                });
            } else if eff > 0.0 && eff < 1.0 {
                events.push(BattleEvent::Log {
                    message: "効果は 今ひとつの ようだ……".to_string(),
                    meta: Map::new(),
                });
            }
        }
    }

    let mut meta = meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id));
    meta.insert("target".to_string(), Value::String(ctx.target_player_id.clone()));
    meta.insert("cancellable".to_string(), Value::Bool(true));
    events.push(BattleEvent::Damage {
        target_id: ctx.target_player_id.clone(),
        amount,
        meta,
    });

    if attacker.ability.as_deref() == Some("parental_bond") {
        let second_power = (power as f32 * 0.25).floor() as i32;
        // Pass true for is_secondary_hit, parental bond 2nd hit doesn't crit
        let (second_amount, _) = calc_damage(second_power, state, &attacker_id, &target_id, ctx, true);
        
        let mut second_meta = meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id));
        second_meta.insert("target".to_string(), Value::String(ctx.target_player_id.clone()));
        second_meta.insert("cancellable".to_string(), Value::Bool(true));
        second_meta.insert("parentalBond".to_string(), Value::Bool(true));
        
        events.push(BattleEvent::Damage {
            target_id: ctx.target_player_id.clone(),
            amount: second_amount,
            meta: second_meta,
        });
    }

    events
}

fn apply_speed_based_damage(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let attacker_speed = compute_speed(state, &ctx.attacker_player_id, ctx.turn);
    let target_speed = compute_speed(state, &ctx.target_player_id, ctx.turn);
    let ratio = if target_speed <= 0.0 {
        f32::INFINITY
    } else {
        attacker_speed / target_speed
    };

    let mut chosen_power = value_i32(effect.data.get("basePower")).unwrap_or(0);
    if let Some(Value::Array(thresholds)) = effect.data.get("thresholds") {
        let mut parsed: Vec<(f32, i32)> = thresholds
            .iter()
            .filter_map(|v| {
                let ratio_val = v.get("ratio").and_then(|r| r.as_f64())? as f32;
                let power_val = v.get("power").and_then(|p| p.as_i64())? as i32;
                Some((ratio_val, power_val))
            })
            .collect();
        parsed.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        for (ratio_threshold, power) in parsed {
            if ratio >= ratio_threshold {
                chosen_power = power;
                break;
            }
        }
    }

    let mut cloned = effect.clone();
    cloned.data.insert("power".to_string(), Value::Number(chosen_power.into()));
    apply_damage(state, &cloned, ctx)
}

fn apply_status(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let status_id = match effect.data.get("statusId").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return Vec::new(),
    };

    let target_id = resolve_target(effect.data.get("target"), ctx);
    if is_item_status(&status_id) {
        return apply_item_status(state, &status_id, &target_id, ctx);
    }

    if let Some(chance) = value_f64(effect.data.get("chance")) {
        if (ctx.rng)() > chance {
            return vec![BattleEvent::Log {
                message: format!("{}の {}は 効かなかった！",
                    get_active_creature(state, &ctx.attacker_player_id).map(|c| c.name.clone()).unwrap_or_else(|| "誰か".to_string()),
                    status_id),
                meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
            }];
        }
    }

    let mut duration = value_i32(effect.data.get("duration"));
    if let Some(Value::Object(range)) = effect.data.get("duration") {
        if let (Some(min), Some(max)) = (range.get("min").and_then(|v| v.as_i64()), range.get("max").and_then(|v| v.as_i64())) {
            let span = (max - min + 1) as f64;
            duration = Some(min as i32 + ((ctx.rng)() * span).floor() as i32);
        }
    }

    let mut data = HashMap::new();
    if let Some(Value::Object(raw)) = effect.data.get("data") {
        for (k, v) in raw {
            data.insert(k.clone(), v.clone());
        }
    }
    if let Some(Value::String(source)) = data.get("sourceId") {
        if source == "self" {
            data.insert(
                "sourceId".to_string(),
                Value::String(ctx.attacker_player_id.clone()),
            );
        }
    }
    if status_id == "substitute" && !data.contains_key("hp") {
        if let Some(target) = get_active_creature(state, &target_id) {
            let hp = ((target.max_hp as f64) * 0.25).floor() as i32;
            data.insert("hp".to_string(), Value::Number(hp.max(1).into()));
        }
    }

    vec![BattleEvent::ApplyStatus {
        target_id,
        status_id: status_id.clone(),
        duration: if status_id == "sleep" { None } else { duration },
        stack: effect.data.get("stack").and_then(|v| v.as_bool()).unwrap_or(false),
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_remove_status(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let status_id = match effect.data.get("statusId").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return Vec::new(),
    };
    let target_id = resolve_target(effect.data.get("target"), ctx);
    vec![BattleEvent::RemoveStatus {
        target_id,
        status_id,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_replace_status(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let from = match effect.data.get("from").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return Vec::new(),
    };
    let to = match effect.data.get("to").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return Vec::new(),
    };
    let target_id = resolve_target(effect.data.get("target"), ctx);
    if from == "active" && to == "pending_switch" {
        return vec![BattleEvent::ApplyStatus {
            target_id,
            status_id: "pending_switch".to_string(),
            duration: None,
            stack: false,
            data: HashMap::new(),
            meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
        }];
    }
    let duration = value_i32(effect.data.get("duration"));
    let mut data = HashMap::new();
    if let Some(Value::Object(raw)) = effect.data.get("data") {
        for (k, v) in raw {
            data.insert(k.clone(), v.clone());
        }
    }
    vec![BattleEvent::ReplaceStatus {
        target_id,
        from,
        to,
        duration,
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_modify_stage(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let mut stages = HashMap::new();
    if let Some(Value::Object(raw)) = effect.data.get("stages") {
        for (k, v) in raw {
            if let Some(delta) = v.as_i64() {
                stages.insert(k.clone(), delta as i32);
            }
        }
    }
    vec![BattleEvent::ModifyStage {
        target_id,
        stages,
        clamp: effect.data.get("clamp").and_then(|v| v.as_bool()).unwrap_or(true),
        fail_if_no_change: effect.data.get("fail_if_no_change").and_then(|v| v.as_bool()).unwrap_or(false),
        show_event: effect.data.get("show_event").and_then(|v| v.as_bool()).unwrap_or(true),
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_clear_stages(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    vec![BattleEvent::ClearStages {
        target_id,
        show_event: effect.data.get("show_event").and_then(|v| v.as_bool()).unwrap_or(true),
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_reset_stages(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    vec![BattleEvent::ResetStages {
        target_id,
        show_event: effect.data.get("show_event").and_then(|v| v.as_bool()).unwrap_or(true),
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_disable_move(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let move_id = effect.data.get("moveId").and_then(|v| v.as_str()).unwrap_or("");
    let mut data = HashMap::new();
    data.insert("moveId".to_string(), Value::String(move_id.to_string()));
    vec![BattleEvent::ApplyStatus {
        target_id,
        status_id: "disable_move".to_string(),
        duration: value_i32(effect.data.get("duration")),
        stack: false,
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_damage_ratio(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let Some(target) = get_active_creature(state, &target_id) else {
        return Vec::new();
    };
    // Support both ratioMaxHp (based on max HP) and ratioCurrentHp (based on current HP)
    let mut amount = if let Some(ratio) = value_f64(effect.data.get("ratioCurrentHp")) {
        (target.hp as f64 * ratio).floor() as i32
    } else {
        let ratio = value_f64(effect.data.get("ratioMaxHp")).unwrap_or(0.0);
        (target.max_hp as f64 * ratio).floor() as i32
    };
    let ratio = value_f64(effect.data.get("ratioCurrentHp"))
        .or_else(|| value_f64(effect.data.get("ratioMaxHp")))
        .unwrap_or(0.0);
    if amount == 0 && ratio != 0.0 {
        amount = if ratio > 0.0 { 1 } else { -1 };
    }
    if amount > 0 {
        amount = amount.max(1);
    } else if amount < 0 {
        amount = amount.min(-1);
    }
    let mut meta = meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id));
    meta.insert("target".to_string(), Value::String(target_id.clone()));
    meta.insert("cancellable".to_string(), Value::Bool(true));
    vec![BattleEvent::Damage {
        target_id,
        amount,
        meta,
    }]
}

fn apply_delay(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let after_turns = value_i32(effect.data.get("afterTurns")).unwrap_or(0);
    let trigger_turn = ctx.turn as i32 + after_turns;
    let mut data = HashMap::new();
    data.insert("triggerTurn".to_string(), Value::Number(trigger_turn.into()));
    data.insert("sourceId".to_string(), Value::String(ctx.attacker_player_id.clone()));
    data.insert("targetId".to_string(), Value::String(target_id.clone()));
    if let Some(Value::Array(effects_value)) = effect.data.get("effects") {
        data.insert("effects".to_string(), Value::Array(effects_value.clone()));
    }
    if let Some(Value::String(timing)) = effect.data.get("timing") {
        data.insert("timing".to_string(), Value::String(timing.clone()));
    }
    vec![BattleEvent::ApplyStatus {
        target_id,
        status_id: "delayed_effect".to_string(),
        duration: Some(after_turns + 1),
        stack: false,
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_over_time(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let mut data = HashMap::new();
    if let Some(Value::Array(effects_value)) = effect.data.get("effects") {
        data.insert("effects".to_string(), Value::Array(effects_value.clone()));
    }
    if let Some(Value::String(timing)) = effect.data.get("timing") {
        data.insert("timing".to_string(), Value::String(timing.clone()));
    }
    data.insert("sourceId".to_string(), Value::String(ctx.attacker_player_id.clone()));
    data.insert("targetId".to_string(), Value::String(target_id.clone()));
    vec![BattleEvent::ApplyStatus {
        target_id,
        status_id: "over_time_effect".to_string(),
        duration: value_i32(effect.data.get("duration")),
        stack: false,
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_chance(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let roll = (ctx.rng)();
    let p = value_f64(effect.data.get("p")).unwrap_or(0.0);
    if roll <= p {
        let effects = effects_from_value(effect.data.get("then"));
        return apply_effects(state, &effects, ctx);
    }
    let effects = effects_from_value(effect.data.get("else"));
    apply_effects(state, &effects, ctx)
}

fn apply_repeat(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let mut times = value_i32(effect.data.get("times")).or_else(|| value_i32(effect.data.get("count"))).unwrap_or(1);
    if let Some(Value::Object(range)) = effect.data.get("times") {
        let min = range.get("min").and_then(|v| v.as_i64()).unwrap_or(1);
        let max = range.get("max").and_then(|v| v.as_i64()).unwrap_or(min);
        let is_skill_link = run_ability_check_hook(
            state,
            &ctx.attacker_player_id,
            "onSkillLink",
            AbilityCheckContext {
                status_id: None,
                r#type: None,
                target_id: None,
                action: None,
            },
            false,
        );
        if is_skill_link {
            times = max as i32;
        } else {
            let span = (max - min + 1) as f64;
            times = min as i32 + ((ctx.rng)() * span).floor() as i32;
        }
    }

    let effects = effects_from_value(effect.data.get("effects"));
    let mut collected = Vec::new();
    let mut working_state = state.clone();
    let mut hits = 0;
    for _ in 0..times {
        if let Some(target) = get_active_creature(&working_state, &ctx.target_player_id) {
            if target.hp <= 0 {
                break;
            }
        }
        let events = apply_effects(&working_state, &effects, ctx);
        working_state = apply_events(&working_state, &events);
        collected.extend(events);
        hits += 1;
    }
    if hits > 1 {
        collected.push(BattleEvent::Log {
            message: format!("{}回 あたった！", hits),
            meta: Map::new(),
        });
    }
    collected
}

fn apply_conditional(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let condition = effect.data.get("if");
    let result = evaluate_condition(state, condition, ctx);
    let next_key = if result { "then" } else { "else" };
    let effects = effects_from_value(effect.data.get(next_key));
    apply_effects(state, &effects, ctx)
}

fn apply_log(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    if let Some(message) = effect.data.get("message").and_then(|v| v.as_str()) {
        return vec![BattleEvent::Log {
            message: message.to_string(),
            meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
        }];
    }
    Vec::new()
}

fn apply_field_status(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let status_id = match effect.data.get("statusId").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return Vec::new(),
    };
    let mut data = HashMap::new();
    if let Some(Value::Object(raw)) = effect.data.get("data") {
        for (k, v) in raw {
            data.insert(k.clone(), v.clone());
        }
    }
    vec![BattleEvent::ApplyFieldStatus {
        status_id,
        duration: value_i32(effect.data.get("duration")),
        stack: effect.data.get("stack").and_then(|v| v.as_bool()).unwrap_or(false),
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_remove_field_status(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let status_id = match effect.data.get("statusId").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return Vec::new(),
    };
    vec![BattleEvent::RemoveFieldStatus {
        status_id,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_random_move(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let pool = effect
        .data
        .get("pool")
        .and_then(|v| v.as_str())
        .unwrap_or("all")
        .to_string();
    vec![BattleEvent::RandomMove {
        pool,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_apply_item(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let Some(target) = get_active_creature(state, &target_id) else {
        return Vec::new();
    };
    let item_id = effect
        .data
        .get("itemId")
        .and_then(|v| v.as_str())
        .unwrap_or("item")
        .to_string();
    let mut data = HashMap::new();
    data.insert("itemId".to_string(), Value::String(item_id.clone()));
    vec![BattleEvent::ApplyStatus {
        target_id,
        status_id: "item".to_string(),
        duration: None,
        stack: false,
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }, BattleEvent::Log {
        message: format!("{}は {}を 手に入れた！", target.name, item_id),
        meta: Map::new(),
    }]
}

fn apply_remove_item(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let Some(target) = get_active_creature(state, &target_id) else {
        return Vec::new();
    };
    let had_item = has_item(target);
    vec![
        BattleEvent::Log {
            message: if had_item {
                format!("{}の 持っていた道具が なくなった！", target.name)
            } else {
                format!("{}は 道具を持っていない！", target.name)
            },
            meta: Map::new(),
        },
        BattleEvent::RemoveStatus {
            target_id: target_id.clone(),
            status_id: "item".to_string(),
            meta: Map::new(),
        },
        BattleEvent::RemoveStatus {
            target_id,
            status_id: "berry".to_string(),
            meta: Map::new(),
        },
    ]
}

fn apply_consume_item(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let Some(target) = get_active_creature(state, &target_id) else {
        return Vec::new();
    };
    if !has_item(target) {
        return vec![BattleEvent::Log {
            message: format!("{}は 道具を持っていない！", target.name),
            meta: Map::new(),
        }];
    }
    let item_id = get_item_id(target).unwrap_or_else(|| "item".to_string());
    let mut events = vec![
        BattleEvent::RemoveStatus {
            target_id: target_id.clone(),
            status_id: "item".to_string(),
            meta: Map::new(),
        },
        BattleEvent::RemoveStatus {
            target_id: target_id.clone(),
            status_id: "berry".to_string(),
            meta: Map::new(),
        },
    ];
    if effect.data.get("markBerryConsumed").and_then(|v| v.as_bool()).unwrap_or(false)
        || item_id.contains("berry")
    {
        events.push(BattleEvent::ApplyStatus {
            target_id,
            status_id: "berry_consumed".to_string(),
            duration: None,
            stack: false,
            data: HashMap::new(),
            meta: Map::new(),
        });
    }
    events.push(BattleEvent::Log {
        message: format!("{}の {}が 発動した！", target.name, item_id),
        meta: Map::new(),
    });
    events
}

fn apply_ohko(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let Some(attacker) = get_active_creature(state, &ctx.attacker_player_id) else {
        return Vec::new();
    };
    let Some(target) = get_active_creature(state, &ctx.target_player_id) else {
        return Vec::new();
    };

    if effect.data.get("respectTypeImmunity").and_then(|v| v.as_bool()).unwrap_or(true)
        && !ctx.ignore_immunity
    {
        if let Some(move_type) = ctx.move_data.and_then(|m| m.move_type.as_deref()) {
            if ctx.type_chart.effectiveness(move_type, &target.types) == 0.0 {
                return vec![BattleEvent::Log {
                    message: "しかし 効かないようだ……".to_string(),
                    meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
                }];
            }
        }
    }

    if let Some(Value::Array(immune_types)) = effect.data.get("immuneTypes") {
        if immune_types.iter().any(|t| t.as_str().map(|s| target.types.iter().any(|ty| ty == s)).unwrap_or(false)) {
            return vec![BattleEvent::Log {
                message: format!("{}は {}には 効かないようだ……", target.name, move_name(ctx.move_data, effect)),
                meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
            }];
        }
    }

    if effect.data.get("failIfTargetHigherLevel").and_then(|v| v.as_bool()).unwrap_or(true)
        && attacker.level < target.level
    {
        return vec![BattleEvent::Log {
            message: format!("{}には 効かないようだ……", move_name(ctx.move_data, effect)),
            meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
        }];
    }

    let base_accuracy = effect
        .data
        .get("baseAccuracy")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.3);
    let mut accuracy = base_accuracy;
    if effect.data.get("levelScaling").and_then(|v| v.as_bool()).unwrap_or(true) {
        accuracy += (attacker.level as f64 - target.level as f64) / 100.0;
    }
    accuracy = accuracy.clamp(0.0, 1.0);

    let move_category = get_move_category(ctx.move_data);
    let accuracy = run_ability_value_hook(
        state,
        &ctx.attacker_player_id,
        "onModifyAccuracy",
        accuracy as f32,
        AbilityValueContext {
            move_data: ctx.move_data,
            category: move_category.as_deref(),
            target: Some(target),
            weather: None,
            turn: ctx.turn,
            stages: None,
        },
    ) as f64;

    if (ctx.rng)() > accuracy {
        return vec![BattleEvent::Log {
            message: "しかし はずれた！".to_string(),
            meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
        }];
    }

    vec![
        BattleEvent::Log {
            message: "一撃必殺！".to_string(),
            meta: Map::new(),
        },
        BattleEvent::Damage {
            target_id: ctx.target_player_id.clone(),
            amount: target.hp,
            meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
        },
    ]
}

fn apply_cure_all_status(effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    vec![BattleEvent::CureAllStatus {
        target_id,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_self_switch(ctx: &EffectContext<'_>) -> Vec<BattleEvent> {
    apply_pending_switch(&ctx.attacker_player_id, ctx)
}

fn apply_force_switch(state: &BattleState, effect: &Effect, ctx: &mut EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    
    // Find the player being forced to switch
    let Some(player) = state.players.iter().find(|p| p.id == target_id) else {
        return Vec::new();
    };
    
    // Collect available slots (not active, HP > 0)
    let available_slots: Vec<usize> = player.team.iter().enumerate()
        .filter(|(i, c)| *i != player.active_slot && c.hp > 0)
        .map(|(i, _)| i)
        .collect();
    
    if available_slots.is_empty() {
        // No Pokémon to switch to
        return vec![BattleEvent::Log {
            message: format!("{} has no Pokémon to switch to!", player.name),
            meta: Map::new(),
        }];
    }
    
    // Randomly select from available slots
    let idx = ((ctx.rng)() * available_slots.len() as f64).floor() as usize;
    let slot = available_slots[idx.min(available_slots.len() - 1)];
    
    vec![BattleEvent::Switch {
        player_id: target_id.clone(),
        slot,
    }]
}

fn apply_replace_pokemon(ctx: &EffectContext<'_>) -> Vec<BattleEvent> {
    apply_pending_switch(&ctx.attacker_player_id, ctx)
}

fn apply_pending_switch(target_id: &str, ctx: &EffectContext<'_>) -> Vec<BattleEvent> {
    vec![BattleEvent::ApplyStatus {
        target_id: target_id.to_string(),
        status_id: "pending_switch".to_string(),
        duration: None,
        stack: false,
        data: HashMap::new(),
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_lock_move(effect: &Effect, ctx: &EffectContext<'_>) -> Vec<BattleEvent> {
    let target_id = resolve_target(effect.data.get("target"), ctx);
    let duration = value_i32(effect.data.get("duration"));
    let mut data = HashMap::new();
    if let Some(Value::Object(raw)) = effect.data.get("data") {
        for (k, v) in raw {
            data.insert(k.clone(), v.clone());
        }
    }
    vec![BattleEvent::ApplyStatus {
        target_id,
        status_id: "lock_move".to_string(),
        duration,
        stack: false,
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }]
}

fn apply_run_away() -> Vec<BattleEvent> {
    Vec::new()
}

fn resolve_target(value: Option<&Value>, ctx: &EffectContext<'_>) -> String {
    match value.and_then(|v| v.as_str()) {
        Some("self") => ctx.attacker_player_id.clone(),
        Some("all") => ctx.target_player_id.clone(),
        Some("target") | None => ctx.target_player_id.clone(),
        Some(other) => other.to_string(),
    }
}

fn apply_item_status(state: &BattleState, status_id: &str, target_id: &str, ctx: &EffectContext<'_>) -> Vec<BattleEvent> {
    let Some(target) = get_active_creature(state, target_id) else {
        return Vec::new();
    };
    let item_id = status_id.to_string();
    let mut data = HashMap::new();
    data.insert("itemId".to_string(), Value::String(item_id.clone()));
    vec![BattleEvent::ApplyStatus {
        target_id: target_id.to_string(),
        status_id: "item".to_string(),
        duration: None,
        stack: false,
        data,
        meta: meta_with_move_source(ctx.move_data.map(|m| m.id.as_str()), Some(&ctx.attacker_player_id)),
    }, BattleEvent::Log {
        message: format!("{} gave {} to {}.",
            get_active_creature(state, &ctx.attacker_player_id).map(|c| c.name.clone()).unwrap_or_else(|| "Someone".to_string()),
            item_id,
            target.name),
        meta: Map::new(),
    }]
}

fn value_f64(value: Option<&Value>) -> Option<f64> {
    value.and_then(|v| v.as_f64())
}

fn value_i32(value: Option<&Value>) -> Option<i32> {
    value.and_then(|v| v.as_i64()).map(|v| v as i32)
}

fn effects_from_value(value: Option<&Value>) -> Vec<Effect> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| serde_json::from_value(item.clone()).ok())
            .collect(),
        _ => Vec::new(),
    }
}

fn move_name(move_data: Option<&MoveData>, effect: &Effect) -> String {
    if let Some(name) = move_data.and_then(|m| m.name.clone()) {
        return name;
    }
    effect
        .data
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("move")
        .to_string()
}

fn get_move_category(move_data: Option<&MoveData>) -> Option<String> {
    if let Some(move_data) = move_data {
        if let Some(cat) = move_data.category.clone() {
            return Some(cat);
        }
        let has_damage = move_data
            .effects
            .iter()
            .any(|effect| effect.effect_type == "damage");
        return Some(if has_damage { "physical" } else { "status" }.to_string());
    }
    None
}

fn apply_modify_damage(events: &mut Vec<BattleEvent>, effect: &Effect) {
    let multiplier = value_f64(effect.data.get("multiplier")).unwrap_or(1.0);
    if multiplier == 1.0 {
        return;
    }
    for event in events.iter_mut().rev() {
        if let BattleEvent::Damage { amount, .. } = event {
            let scaled = (*amount as f64) * multiplier;
            *amount = scaled.round() as i32;
            break;
        }
    }
}

fn apply_force_crit(events: &mut Vec<BattleEvent>, effect: &Effect) {
    let multiplier = value_f64(effect.data.get("multiplier"))
        .or_else(|| value_f64(effect.data.get("mult")))
        .unwrap_or(1.5);
    for event in events.iter_mut().rev() {
        if let BattleEvent::Damage { amount, .. } = event {
            let scaled = (*amount as f64) * multiplier;
            *amount = scaled.round() as i32;
            break;
        }
    }
}

fn apply_effect_flags(ctx: &mut EffectContext<'_>, effects: &[Effect]) {
    for effect in effects {
        match effect.effect_type.as_str() {
            "bypass_protect" => ctx.bypass_protect = true,
            "ignore_immunity" => ctx.ignore_immunity = true,
            "bypass_substitute" => ctx.bypass_substitute = true,
            "ignore_substitute" => {
                ctx.ignore_substitute = true;
                ctx.bypass_substitute = true;
            }
            "sound" => ctx.is_sound = true,
            _ => {}
        }
    }
}

fn apply_move_tag_flags(ctx: &mut EffectContext<'_>) {
    let Some(move_data) = ctx.move_data else {
        return;
    };
    for tag in &move_data.tags {
        match tag.as_str() {
            "sound" => ctx.is_sound = true,
            "bypass_substitute" | "bypass-substitute" => ctx.bypass_substitute = true,
            _ => {}
        }
    }
}

fn apply_meta_flags(events: &mut [BattleEvent], ctx: &EffectContext<'_>) {
    if !(ctx.bypass_protect
        || ctx.ignore_immunity
        || ctx.bypass_substitute
        || ctx.ignore_substitute
        || ctx.is_sound)
    {
        return;
    }
    for event in events {
        if let Some(meta) = event_meta_mut(event) {
            if ctx.bypass_protect {
                meta.insert("bypassProtect".to_string(), Value::Bool(true));
            }
            if ctx.ignore_immunity {
                meta.insert("ignoreImmunity".to_string(), Value::Bool(true));
            }
            if ctx.bypass_substitute {
                meta.insert("bypassSubstitute".to_string(), Value::Bool(true));
            }
            if ctx.ignore_substitute {
                meta.insert("ignoreSubstitute".to_string(), Value::Bool(true));
            }
            if ctx.is_sound {
                meta.insert("sound".to_string(), Value::Bool(true));
            }
        }
    }
}

fn event_meta_mut(event: &mut BattleEvent) -> Option<&mut Map<String, Value>> {
    match event {
        BattleEvent::Log { meta, .. }
        | BattleEvent::Damage { meta, .. }
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

fn evaluate_condition(state: &BattleState, cond: Option<&Value>, ctx: &EffectContext<'_>) -> bool {
    let Some(Value::Object(cond_map)) = cond else {
        return false;
    };
    let Some(Value::String(cond_type)) = cond_map.get("type") else {
        return false;
    };
    match cond_type.as_str() {
        "target_has_status" => {
            let target = get_active_creature(state, &ctx.target_player_id);
            let status_id = cond_map.get("statusId").and_then(|v| v.as_str()).unwrap_or("");
            if is_item_status(status_id) {
                return target.map_or(false, |c| has_item(c));
            }
            target.map_or(false, |c| c.statuses.iter().any(|s| s.id == status_id))
        }
        "target_hp_lt" => {
            let target = get_active_creature(state, &ctx.target_player_id);
            if let Some(target) = target {
                let ratio = target.hp as f64 / target.max_hp as f64;
                let value = cond_map.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
                ratio < value
            } else {
                false
            }
        }
        "field_has_status" => {
            let status_id = cond_map.get("statusId").and_then(|v| v.as_str()).unwrap_or("");
            state.field.global.iter().any(|e| e.id == status_id)
        }
        "weather_is_sunny" => weather_has_any(state, &["sunny_weather", "sunny_day", "sun"]),
        "weather_is_raining" => weather_has_any(state, &["rain", "rainy_weather", "rain_dance"]),
        "weather_is_hail" => weather_has_any(state, &["hail", "hail_weather", "snow"]),
        "weather_is_sandstorm" => weather_has_any(state, &["sandstorm", "sandstorm_weather"]),
        "user_type" => {
            let type_id = cond_map.get("typeId").and_then(|v| v.as_str()).unwrap_or("");
            get_active_creature(state, &ctx.attacker_player_id)
                .map_or(false, |c| c.types.iter().any(|t| t == type_id))
        }
        "user_has_status" => {
            let status_id = cond_map.get("statusId").and_then(|v| v.as_str()).unwrap_or("");
            get_active_creature(state, &ctx.attacker_player_id)
                .map_or(false, |c| c.statuses.iter().any(|s| s.id == status_id))
        }
        "target_has_item" => get_active_creature(state, &ctx.target_player_id).map_or(false, |c| has_item(c)),
        "user_has_item" => get_active_creature(state, &ctx.attacker_player_id).map_or(false, |c| has_item(c)),
        _ => false,
    }
}

fn weather_has_any(state: &BattleState, ids: &[&str]) -> bool {
    state.field.global.iter().any(|e| ids.contains(&e.id.as_str()))
}

fn compute_speed(state: &BattleState, player_id: &str, turn: u32) -> f32 {
    let Some(creature) = get_active_creature(state, player_id) else {
        return 0.0;
    };
    let stage = creature.stages.spe;
    let mut speed = creature.speed as f32 * stage_multiplier(stage);
    let weather = crate::core::abilities::get_weather(state);
    speed = run_ability_value_hook(
        state,
        player_id,
        "onModifySpeed",
        speed,
        AbilityValueContext {
            move_data: None,
            category: None,
            target: None,
            weather: weather.as_ref().map(|w| match w {
                WeatherKind::Sun => "sun",
                WeatherKind::Rain => "rain",
            }),
            turn,
            stages: None,
        },
    );
    speed
}

fn calc_damage(power: i32, state: &BattleState, attacker_id: &str, target_id: &str, ctx: &mut EffectContext<'_>, is_secondary_hit: bool) -> (i32, bool) {
    let Some(attacker) = get_active_creature(state, attacker_id) else {
        return (0, false);
    };
    let Some(target) = get_active_creature(state, target_id) else {
        return (0, false);
    };
    let power = power.max(0) as f32;
    if power <= 0.0 {
        return (0, false);
    }

    let category = get_move_category(ctx.move_data).unwrap_or_else(|| "physical".to_string());
    let mut crit_stage = ctx.move_data.and_then(|m| m.crit_rate).unwrap_or(0) as f32;
    crit_stage += attacker.stages.crit as f32;
    crit_stage = run_ability_value_hook(
        state,
        attacker_id,
        "onModifyCritChance",
        crit_stage,
        AbilityValueContext {
            move_data: ctx.move_data,
            category: Some(&category),
            target: Some(target),
            weather: None,
            turn: ctx.turn,
            stages: None,
        },
    );
    // 急所ランクの確率設定
    // ランク0: 1/24 (~4.17%)
    // ランク1: 1/8 (12.5%)
    // ランク2: 1/2 (50%)
    // ランク3+: 100%
    let crit_chance = if crit_stage <= 0.0 {
        1.0 / 24.0
    } else if crit_stage <= 1.0 {
        1.0 / 8.0
    } else if crit_stage <= 2.0 {
        1.0 / 2.0
    } else {
        1.0
    };
    
    let is_crit = if is_secondary_hit {
        false
    } else if crit_chance >= 1.0 {
        true
    } else {
        (ctx.rng)() < crit_chance
    };

    let mut move_power = run_ability_value_hook(
        state,
        attacker_id,
        "onModifyPower",
        power,
        AbilityValueContext {
            move_data: ctx.move_data,
            category: Some(&category),
            target: Some(target),
            weather: None,
            turn: ctx.turn,
            stages: None,
        },
    );

    move_power = run_ability_value_hook(
        state,
        target_id,
        "onDefensivePower",
        move_power,
        AbilityValueContext {
            move_data: ctx.move_data,
            category: Some(&category),
            target: Some(attacker),
            weather: None,
            turn: ctx.turn,
            stages: None,
        },
    );

    let (offense_key, defense_key, stage_key_offense, stage_key_defense) = if category == "special" {
        (attacker.sp_attack, target.sp_defense, attacker.stages.spa, target.stages.spd)
    } else {
        (attacker.attack, target.defense, attacker.stages.atk, target.stages.def)
    };

    let mut atk_stage = stage_key_offense;
    let mut def_stage = stage_key_defense;
    
    // 急所の場合、相手の防御・特防上昇ランクを無視（0として扱う）
    if is_crit && def_stage > 0 {
        def_stage = 0;
    }

    if attacker.ability.as_deref() == Some("unaware") {
        def_stage = 0;
    }
    if target.ability.as_deref() == Some("unaware") {
        atk_stage = 0;
    }

    let attack = offense_key as f32 * stage_multiplier(atk_stage);
    let defense = (defense_key as f32 * stage_multiplier(def_stage)).max(1.0);

    let attack = run_ability_value_hook(
        state,
        attacker_id,
        "onModifyOffense",
        attack,
        AbilityValueContext {
            move_data: ctx.move_data,
            category: Some(&category),
            target: Some(target),
            weather: None,
            turn: ctx.turn,
            stages: Some(atk_stage),
        },
    );

    let defense = run_ability_value_hook(
        state,
        target_id,
        "onModifyDefense",
        defense,
        AbilityValueContext {
            move_data: ctx.move_data,
            category: Some(&category),
            target: Some(attacker),
            weather: None,
            turn: ctx.turn,
            stages: Some(def_stage),
        },
    );

    let level = attacker.level as f32;
    let base = (((2.0 * level / 5.0 + 2.0) * move_power * attack / defense) / 50.0 + 2.0).max(1.0);
    let roll = 0.85 + (1.0 - 0.85) * (ctx.rng)() as f32;

    let mut modifier = 1.0;
    if let Some(move_type) = ctx.move_data.and_then(|m| m.move_type.as_deref()) {
        if attacker.types.iter().any(|t| t.eq_ignore_ascii_case(move_type)) {
            modifier *= 1.5;
        }
        let mut effectiveness = ctx.type_chart.effectiveness(move_type, &target.types);
        if effectiveness == 0.0 {
            if ctx.ignore_immunity {
                effectiveness = 1.0;
            } else {
                return (0, false);
            }
        }
        modifier *= effectiveness;
    }

    if is_crit {
        modifier *= 1.5;
    }
    let damage = (base * roll * modifier).floor() as i32;
    (damage.max(1), is_crit)
}

fn is_item_status(status_id: &str) -> bool {
    status_id == "item" || status_id == "berry"
}

pub fn has_item(creature: &crate::core::state::CreatureState) -> bool {
    if creature.item.is_some() {
        return true;
    }
    creature
        .statuses
        .iter()
        .any(|s| s.id == "item" || s.id == "berry")
}

fn get_item_id(creature: &crate::core::state::CreatureState) -> Option<String> {
    if let Some(item) = &creature.item {
        return Some(item.clone());
    }
    creature
        .statuses
        .iter()
        .find(|s| s.id == "item" || s.id == "berry")
        .and_then(|s| s.data.get("itemId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}
