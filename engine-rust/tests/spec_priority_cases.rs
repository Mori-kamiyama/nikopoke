mod support;

use engine_rust::core::battle::{determine_timeout_winner, determine_winner, BattleEngine};
use engine_rust::core::effects::{apply_effects, EffectContext};
use engine_rust::core::events::BattleEvent;
use engine_rust::core::state::{BattleState, FieldEffect};
use engine_rust::data::learnsets::LearnsetDatabase;
use engine_rust::data::moves::{Effect, MoveData, MoveDatabase};
use engine_rust::data::type_chart::TypeChart;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use support::harness::{
    assert_active_has_status, assert_active_hp, assert_field_has_status, battle_state, move_action,
    player, run_turn_with_seed, run_turns_with_seed, status, switch_action, CreatureBuilder,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Priority {
    P0,
    P1,
    P2,
}

#[derive(Clone, Copy, Debug)]
struct CaseMeta {
    id: &'static str,
    priority: Priority,
    enabled: bool,
}

const CASES: &[CaseMeta] = &[
    CaseMeta {
        id: "P0-CRIT-DEF-STAGE-IGNORE",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-CRIT-ATK-STAGE-IGNORE",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-CRIT-WALL-BYPASS",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-FIELD-STATUS-ATTACH",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-DAMAGE-ROLL-GOLDEN",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-TRICK-ROOM-ORDER",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-REFLECT-DAMAGE",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-LIGHT-SCREEN-DAMAGE",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-TAILWIND-SPEED",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-TOXIC-RESIDUAL",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-TOXIC-SWITCH-RESET",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-PROTECT-CHAIN-PROB",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-SLEEP-SWITCH",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-MANUAL-NOOP-GATE",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-WIN-SIMULTANEOUS-FAINT",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P0-WIN-TIMEOUT-RULE",
        priority: Priority::P0,
        enabled: true,
    },
    CaseMeta {
        id: "P1-LEARNSET-MOVE-REF",
        priority: Priority::P1,
        enabled: true,
    },
    CaseMeta {
        id: "P1-TARGET-LITERAL-LINT",
        priority: Priority::P1,
        enabled: true,
    },
    CaseMeta {
        id: "P1-STATUS-ID-LINT",
        priority: Priority::P1,
        enabled: true,
    },
    CaseMeta {
        id: "P1-ABILITY-STATUS-FIELD",
        priority: Priority::P1,
        enabled: true,
    },
    CaseMeta {
        id: "P1-ENDTURN-ORDER",
        priority: Priority::P1,
        enabled: true,
    },
    CaseMeta {
        id: "P1-MANUAL-REASON-TAXONOMY",
        priority: Priority::P1,
        enabled: true,
    },
    CaseMeta {
        id: "P2-CASE-REGISTRY-INTEGRITY",
        priority: Priority::P2,
        enabled: true,
    },
    CaseMeta {
        id: "P2-CASE-DOC-SYNC",
        priority: Priority::P2,
        enabled: true,
    },
    CaseMeta {
        id: "P2-DOUBLE-MODEL-SMOKE",
        priority: Priority::P2,
        enabled: true,
    },
];

fn effect(effect_type: &str, data: Value) -> Effect {
    let map: Map<String, Value> = data.as_object().cloned().unwrap_or_default();
    Effect {
        effect_type: effect_type.to_string(),
        data: map,
    }
}

fn wait_move() -> MoveData {
    MoveData {
        id: "wait".to_string(),
        name: Some("Wait".to_string()),
        move_type: Some("normal".to_string()),
        category: Some("status".to_string()),
        pp: Some(10),
        power: None,
        accuracy: None,
        priority: Some(0),
        description: None,
        steps: Vec::new(),
        tags: Vec::new(),
        crit_rate: None,
    }
}

fn damage_move(id: &str, category: &str, power: i32, crit_rate: Option<i32>) -> MoveData {
    MoveData {
        id: id.to_string(),
        name: Some(id.to_string()),
        move_type: Some("normal".to_string()),
        category: Some(category.to_string()),
        pp: Some(10),
        power: Some(power),
        accuracy: Some(1.0),
        priority: Some(0),
        description: None,
        steps: vec![effect("damage", json!({ "power": power, "accuracy": 1.0 }))],
        tags: Vec::new(),
        crit_rate,
    }
}

fn field_status_move(id: &str, status_id: &str) -> MoveData {
    MoveData {
        id: id.to_string(),
        name: Some(id.to_string()),
        move_type: Some("normal".to_string()),
        category: Some("status".to_string()),
        pp: Some(10),
        power: None,
        accuracy: None,
        priority: Some(0),
        description: None,
        steps: vec![effect(
            "apply_field_status",
            json!({ "statusId": status_id, "duration": 5, "stack": false }),
        )],
        tags: Vec::new(),
        crit_rate: None,
    }
}

fn make_engine(moves: Vec<MoveData>) -> BattleEngine {
    let mut move_db = MoveDatabase::new();
    for mv in moves {
        move_db.insert(mv);
    }
    BattleEngine::new(move_db, TypeChart::new())
}

fn active_hp(state: &BattleState, player_id: &str) -> i32 {
    let player = state
        .players
        .iter()
        .find(|p| p.id == player_id)
        .unwrap_or_else(|| panic!("player '{}' not found", player_id));
    let active = &player.team[player.active_slot];
    active.hp
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

fn walk_effects<F>(effects: &[Effect], visit: &mut F)
where
    F: FnMut(&Effect),
{
    for effect in effects {
        visit(effect);
        match effect.effect_type.as_str() {
            "chance" | "conditional" => {
                let then_effects = effects_from_value(effect.data.get("then"));
                let else_effects = effects_from_value(effect.data.get("else"));
                walk_effects(&then_effects, visit);
                walk_effects(&else_effects, visit);
            }
            "repeat" | "delay" | "over_time" => {
                let nested = effects_from_value(
                    effect
                        .data
                        .get("steps")
                        .or_else(|| effect.data.get("effects")),
                );
                walk_effects(&nested, visit);
            }
            _ => {}
        }
    }
}

fn is_allowed_target_literal(value: &str) -> bool {
    if matches!(value, "self" | "target" | "all") {
        return true;
    }
    if let Some(rest) = value.strip_prefix('p') {
        return !rest.is_empty() && rest.chars().all(|ch| ch.is_ascii_digit());
    }
    false
}

fn is_supported_status_id(status_id: &str) -> bool {
    matches!(
        status_id,
        "burn"
            | "poison"
            | "toxic"
            | "paralysis"
            | "sleep"
            | "freeze"
            | "confusion"
            | "flinch"
            | "protect"
            | "substitute"
            | "lock_move"
            | "disable_move"
            | "encore"
            | "taunt"
            | "leech_seed"
            | "curse"
            | "yawn"
            | "bind"
            | "wish"
            | "pending_switch"
            | "item"
            | "berry"
            | "berry_consumed"
            | "leftovers"
            | "black_sludge"
            | "grassy_terrain"
            | "electric_terrain"
            | "misty_terrain"
            | "psychic_terrain"
            | "rain"
            | "sun"
            | "sandstorm"
            | "trick_room"
            | "reflect"
            | "light_screen"
            | "aurora_veil"
            | "tailwind"
            | "spikes"
            | "toxic_spikes"
            | "stealth_rock"
            | "sticky_web"
    )
}

fn has_status_log(events: &[BattleEvent], pattern: &str) -> bool {
    events.iter().any(|event| match event {
        BattleEvent::Log { message, .. } => message.contains(pattern),
        _ => false,
    })
}

fn first_damage_amount(events: &[BattleEvent]) -> i32 {
    events
        .iter()
        .find_map(|event| match event {
            BattleEvent::Damage { amount, .. } => Some(*amount),
            _ => None,
        })
        .expect("expected at least one damage event")
}

#[test]
fn p0_crit_ignores_positive_def_stage() {
    let engine = make_engine(vec![
        damage_move("always_crit", "physical", 90, Some(3)),
        wait_move(),
    ]);

    let actions = vec![
        move_action("p1", "always_crit", "p2"),
        move_action("p2", "wait", "p1"),
    ];

    let state_no_boost = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Attacker")
                .moves(&["always_crit"])
                .stats(90, 50, 50, 50, 80)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Defender")
                .moves(&["wait"])
                .stats(50, 100, 50, 50, 50)
                .build()],
        ),
    ]);

    let mut state_with_boost = state_no_boost.clone();
    state_with_boost.players[1].team[0].stages.def = 6;

    let next_no_boost = run_turn_with_seed(&engine, &state_no_boost, &actions, 7);
    let next_with_boost = run_turn_with_seed(&engine, &state_with_boost, &actions, 7);

    assert_eq!(
        active_hp(&next_no_boost, "p2"),
        active_hp(&next_with_boost, "p2"),
        "critical damage should ignore positive defense stages"
    );
}

#[test]
fn p0_spec_crit_ignores_negative_attack_stage() {
    let engine = make_engine(vec![
        damage_move("always_crit", "physical", 90, Some(3)),
        wait_move(),
    ]);

    let actions = vec![
        move_action("p1", "always_crit", "p2"),
        move_action("p2", "wait", "p1"),
    ];

    let base_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Attacker")
                .moves(&["always_crit"])
                .stats(90, 50, 50, 50, 80)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Defender")
                .moves(&["wait"])
                .stats(50, 100, 50, 50, 50)
                .build()],
        ),
    ]);

    let mut state_with_drop = base_state.clone();
    state_with_drop.players[0].team[0].stages.atk = -6;

    let next_base = run_turn_with_seed(&engine, &base_state, &actions, 8);
    let next_with_drop = run_turn_with_seed(&engine, &state_with_drop, &actions, 8);

    assert_eq!(
        active_hp(&next_base, "p2"),
        active_hp(&next_with_drop, "p2"),
        "critical damage should ignore attack drops on attacker"
    );
}

#[test]
fn p0_spec_crit_bypasses_walls_while_non_crit_does_not() {
    let non_crit_engine = make_engine(vec![damage_move("strike", "physical", 80, None), wait_move()]);
    let crit_engine = make_engine(vec![damage_move("always_crit", "physical", 80, Some(3)), wait_move()]);

    let base_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Attacker")
                .moves(&["strike", "always_crit"])
                .stats(100, 50, 50, 50, 80)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Defender")
                .moves(&["wait"])
                .stats(50, 100, 50, 50, 50)
                .build()],
        ),
    ]);
    let mut state_with_reflect = base_state.clone();
    state_with_reflect.field.global.push(FieldEffect {
        id: "reflect".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });

    let non_crit_actions = vec![
        move_action("p1", "strike", "p2"),
        move_action("p2", "wait", "p1"),
    ];
    let crit_actions = vec![
        move_action("p1", "always_crit", "p2"),
        move_action("p2", "wait", "p1"),
    ];

    let non_crit_no_wall = run_turn_with_seed(&non_crit_engine, &base_state, &non_crit_actions, 31);
    let non_crit_with_wall =
        run_turn_with_seed(&non_crit_engine, &state_with_reflect, &non_crit_actions, 31);
    let crit_no_wall = run_turn_with_seed(&crit_engine, &base_state, &crit_actions, 31);
    let crit_with_wall = run_turn_with_seed(&crit_engine, &state_with_reflect, &crit_actions, 31);

    assert!(
        active_hp(&non_crit_with_wall, "p2") > active_hp(&non_crit_no_wall, "p2"),
        "non-crit damage should be reduced by reflect"
    );
    assert_eq!(
        active_hp(&crit_with_wall, "p2"),
        active_hp(&crit_no_wall, "p2"),
        "critical damage should bypass reflect"
    );
}

#[test]
fn p0_field_status_move_sets_status_on_field() {
    let engine = make_engine(vec![field_status_move("set_trick_room", "trick_room"), wait_move()]);
    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Alpha")
                .moves(&["set_trick_room"])
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Beta").moves(&["wait"]).build()],
        ),
    ]);
    let actions = vec![
        move_action("p1", "set_trick_room", "p2"),
        move_action("p2", "wait", "p1"),
    ];

    let next = run_turn_with_seed(&engine, &state, &actions, 11);
    assert_field_has_status(&next, "trick_room");
}

#[test]
fn p0_spec_damage_roll_matches_golden_fixture() {
    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Attacker")
                .moves(&["raw_damage"])
                .stats(100, 100, 50, 50, 80)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Defender")
                .moves(&["wait"])
                .stats(100, 100, 50, 50, 60)
                .build()],
        ),
    ]);

    let move_data = damage_move("raw_damage", "physical", 100, None);
    let damage_step = effect("damage", json!({ "power": 100, "accuracy": 1.0 }));
    let type_chart = TypeChart::new();

    let mut low_roll_rng = {
        let mut seq = vec![0.0, 0.99, 0.0].into_iter();
        move || seq.next().unwrap_or(0.0)
    };
    let mut low_ctx = EffectContext {
        attacker_player_id: "p1".to_string(),
        target_player_id: "p2".to_string(),
        move_data: Some(&move_data),
        rng: &mut low_roll_rng,
        turn: 1,
        type_chart: &type_chart,
        bypass_protect: false,
        ignore_immunity: false,
        bypass_substitute: false,
        ignore_substitute: false,
        is_sound: false,
        last_damage: None,
    };
    let low_events = apply_effects(&state, &[damage_step.clone()], &mut low_ctx);

    let mut high_roll_rng = {
        let mut seq = vec![0.0, 0.99, 0.999999].into_iter();
        move || seq.next().unwrap_or(0.0)
    };
    let mut high_ctx = EffectContext {
        attacker_player_id: "p1".to_string(),
        target_player_id: "p2".to_string(),
        move_data: Some(&move_data),
        rng: &mut high_roll_rng,
        turn: 1,
        type_chart: &type_chart,
        bypass_protect: false,
        ignore_immunity: false,
        bypass_substitute: false,
        ignore_substitute: false,
        is_sound: false,
        last_damage: None,
    };
    let high_events = apply_effects(&state, &[damage_step], &mut high_ctx);

    let low_damage = first_damage_amount(&low_events);
    let high_damage = first_damage_amount(&high_events);

    // Expected with L50, power 100, atk 100, def 100, STAB=1.5:
    // base = 46, final = floor(69 * roll).
    assert_eq!(low_damage, 58, "roll=0.85 should yield floor(69*0.85)=58");
    assert_eq!(high_damage, 69, "roll=1.00 should yield floor(69*1.00)=69");
}

#[test]
fn p0_spec_trick_room_reverses_action_order() {
    let engine = make_engine(vec![damage_move("one_shot", "physical", 400, None)]);

    let mut state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Fast")
                .moves(&["one_shot"])
                .stats(80, 50, 50, 50, 200)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Slow")
                .moves(&["one_shot"])
                .stats(80, 50, 50, 50, 20)
                .build()],
        ),
    ]);
    state.field.global.push(FieldEffect {
        id: "trick_room".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });

    let actions = vec![
        move_action("p1", "one_shot", "p2"),
        move_action("p2", "one_shot", "p1"),
    ];
    let next = run_turn_with_seed(&engine, &state, &actions, 5);

    assert_active_hp(&next, "p1", 0);
    assert_active_hp(&next, "p2", 100);
}

#[test]
fn p0_spec_reflect_reduces_physical_damage() {
    let engine = make_engine(vec![damage_move("strike", "physical", 80, None), wait_move()]);

    let base_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Attacker")
                .moves(&["strike"])
                .stats(100, 50, 50, 50, 80)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Defender")
                .moves(&["wait"])
                .stats(50, 100, 50, 50, 50)
                .build()],
        ),
    ]);

    let mut state_with_reflect = base_state.clone();
    state_with_reflect.field.global.push(FieldEffect {
        id: "reflect".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });

    let actions = vec![
        move_action("p1", "strike", "p2"),
        move_action("p2", "wait", "p1"),
    ];

    let next_without_reflect = run_turn_with_seed(&engine, &base_state, &actions, 17);
    let next_with_reflect = run_turn_with_seed(&engine, &state_with_reflect, &actions, 17);

    assert!(
        active_hp(&next_with_reflect, "p2") > active_hp(&next_without_reflect, "p2"),
        "reflect should reduce incoming physical damage"
    );
}

#[test]
fn p0_spec_light_screen_reduces_special_damage() {
    let engine = make_engine(vec![damage_move("beam", "special", 80, None), wait_move()]);

    let base_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Attacker")
                .moves(&["beam"])
                .stats(50, 50, 100, 50, 80)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Defender")
                .moves(&["wait"])
                .stats(50, 50, 50, 100, 50)
                .build()],
        ),
    ]);
    let mut state_with_screen = base_state.clone();
    state_with_screen.field.global.push(FieldEffect {
        id: "light_screen".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });

    let actions = vec![
        move_action("p1", "beam", "p2"),
        move_action("p2", "wait", "p1"),
    ];

    let next_without_screen = run_turn_with_seed(&engine, &base_state, &actions, 19);
    let next_with_screen = run_turn_with_seed(&engine, &state_with_screen, &actions, 19);

    assert!(
        active_hp(&next_with_screen, "p2") > active_hp(&next_without_screen, "p2"),
        "light_screen should reduce incoming special damage"
    );
}

#[test]
fn p0_spec_tailwind_changes_action_order_by_speed() {
    let engine = make_engine(vec![damage_move("one_shot", "physical", 400, None)]);

    let mut state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Slow")
                .moves(&["one_shot"])
                .stats(80, 50, 50, 50, 40)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Fast")
                .moves(&["one_shot"])
                .stats(80, 50, 50, 50, 60)
                .build()],
        ),
    ]);
    state.field.sides.insert(
        "p1".to_string(),
        vec![FieldEffect {
            id: "tailwind".to_string(),
            remaining_turns: Some(4),
            data: HashMap::new(),
        }],
    );

    let actions = vec![
        move_action("p1", "one_shot", "p2"),
        move_action("p2", "one_shot", "p1"),
    ];
    let next = run_turn_with_seed(&engine, &state, &actions, 41);

    assert_active_hp(&next, "p1", 100);
    assert_active_hp(&next, "p2", 0);
}

#[test]
fn p0_spec_toxic_damage_scales_each_turn() {
    let engine = make_engine(vec![wait_move()]);
    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Poisoned")
                .moves(&["wait"])
                .hp(96, 96)
                .with_status(status("toxic", None))
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Idle")
                .moves(&["wait"])
                .build()],
        ),
    ]);

    let turns = vec![
        vec![
            move_action("p1", "wait", "p2"),
            move_action("p2", "wait", "p1"),
        ],
        vec![
            move_action("p1", "wait", "p2"),
            move_action("p2", "wait", "p1"),
        ],
    ];
    let next = run_turns_with_seed(&engine, state, &turns, 13);

    assert_active_hp(&next, "p1", 78);
}

#[test]
fn p0_spec_toxic_resets_counter_after_switch() {
    let engine = make_engine(vec![wait_move()]);
    let initial = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![
                CreatureBuilder::new("c1", "Poisoned")
                    .moves(&["wait"])
                    .hp(96, 96)
                    .with_status(status("toxic", None))
                    .build(),
                CreatureBuilder::new("c3", "Bench")
                    .moves(&["wait"])
                    .hp(96, 96)
                    .build(),
            ],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Idle")
                .moves(&["wait"])
                .build()],
        ),
    ]);

    let turns = vec![
        vec![
            move_action("p1", "wait", "p2"),
            move_action("p2", "wait", "p1"),
        ],
        vec![switch_action("p1", 1), move_action("p2", "wait", "p1")],
        vec![switch_action("p1", 0), move_action("p2", "wait", "p1")],
    ];
    let next = run_turns_with_seed(&engine, initial, &turns, 101);

    assert_active_hp(&next, "p1", 84);
}

#[test]
fn p0_spec_protect_chain_probability_is_one_third_then_one_ninth() {
    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![{
                let mut c = CreatureBuilder::new("c1", "Guard").moves(&["wait"]).build();
                c.volatile_data.insert(
                    "protectSuccessCount".to_string(),
                    Value::Number(1.into()),
                );
                c
            }],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Dummy")
                .moves(&["wait"])
                .build()],
        ),
    ]);

    let mut rng = || 0.4;
    let type_chart = TypeChart::new();
    let mut ctx = EffectContext {
        attacker_player_id: "p1".to_string(),
        target_player_id: "p2".to_string(),
        move_data: None,
        rng: &mut rng,
        turn: 0,
        type_chart: &type_chart,
        bypass_protect: false,
        ignore_immunity: false,
        bypass_substitute: false,
        ignore_substitute: false,
        is_sound: false,
        last_damage: None,
    };
    let events = apply_effects(&state, &[effect("protect", json!({}))], &mut ctx);

    let reset_seen = events.iter().any(|event| match event {
        BattleEvent::SetVolatile { key, value, .. } => {
            key == "protectSuccessCount" && value == &Value::Number(0.into())
        }
        _ => false,
    });

    assert!(
        has_status_log(&events, "失敗") && reset_seen,
        "second chained protect at rng=0.4 should fail under 1/3 rule"
    );
}

#[test]
fn p0_spec_sleep_persists_when_switched_out() {
    let engine = make_engine(vec![wait_move()]);
    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![
                CreatureBuilder::new("c1", "Sleeper")
                    .moves(&["wait"])
                    .with_status(status("sleep", None))
                    .build(),
                CreatureBuilder::new("c3", "Reserve")
                    .moves(&["wait"])
                    .build(),
            ],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Opponent")
                .moves(&["wait"])
                .build()],
        ),
    ]);

    let actions = vec![switch_action("p1", 1), move_action("p2", "wait", "p1")];
    let next = run_turn_with_seed(&engine, &state, &actions, 21);

    let outgoing = &next.players[0].team[0];
    assert!(
        outgoing.statuses.iter().any(|s| s.id == "sleep"),
        "sleep should remain on switched-out Pokemon"
    );
}

#[test]
fn p0_manual_effects_must_not_be_silent_noop() {
    let move_db = MoveDatabase::load_from_yaml_file(Path::new("data/moves.yaml"))
        .expect("load moves.yaml");

    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "ManualUser")
                .moves(&["wait"])
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Target")
                .moves(&["wait"])
                .build()],
        ),
    ]);
    let type_chart = TypeChart::new();

    let mut offenders = Vec::new();
    for (move_id, move_data) in move_db.as_map() {
        walk_effects(&move_data.steps, &mut |effect| {
            if effect.effect_type != "manual" {
                return;
            }
            let manual_effect = effect.clone();
            let mut rng = || 0.0;
            let mut ctx = EffectContext {
                attacker_player_id: "p1".to_string(),
                target_player_id: "p2".to_string(),
                move_data: Some(move_data),
                rng: &mut rng,
                turn: 1,
                type_chart: &type_chart,
                bypass_protect: false,
                ignore_immunity: false,
                bypass_substitute: false,
                ignore_substitute: false,
                is_sound: false,
                last_damage: None,
            };
            let events = apply_effects(&state, &[manual_effect], &mut ctx);
            if events.is_empty() {
                offenders.push(move_id.to_string());
            }
        });
    }

    assert!(
        offenders.is_empty(),
        "manual effects produced no runtime events:\n{}",
        offenders.join("\n")
    );
}

#[test]
fn p0_spec_simultaneous_faint_resolution_rule() {
    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Fast")
                .hp(0, 100)
                .stats(50, 50, 50, 50, 120)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Slow")
                .hp(0, 100)
                .stats(50, 50, 50, 50, 40)
                .build()],
        ),
    ]);
    let winner = determine_winner(&state);
    assert_eq!(
        winner.as_deref(),
        Some("p2"),
        "faster side should faint first and lose in simultaneous-faint resolution"
    );

    let mut trick_room_state = state.clone();
    trick_room_state.field.global.push(FieldEffect {
        id: "trick_room".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });
    let trick_room_winner = determine_winner(&trick_room_state);
    assert_eq!(
        trick_room_winner.as_deref(),
        Some("p1"),
        "under trick room, slower side should faint first and lose"
    );
}

#[test]
fn p0_spec_timeout_resolution_rule() {
    let alive_count_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![
                CreatureBuilder::new("c1", "A1").hp(50, 100).build(),
                CreatureBuilder::new("c3", "A2").hp(1, 100).build(),
            ],
        ),
        player(
            "p2",
            "P2",
            vec![
                CreatureBuilder::new("c2", "B1").hp(99, 100).build(),
                CreatureBuilder::new("c4", "B2").hp(0, 100).build(),
            ],
        ),
    ]);
    assert_eq!(
        determine_timeout_winner(&alive_count_state).as_deref(),
        Some("p1"),
        "timeout should prioritize remaining Pokemon count"
    );

    let hp_ratio_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![
                CreatureBuilder::new("c1", "A1").hp(40, 100).build(),
                CreatureBuilder::new("c3", "A2").hp(0, 100).build(),
            ],
        ),
        player(
            "p2",
            "P2",
            vec![
                CreatureBuilder::new("c2", "B1").hp(39, 100).build(),
                CreatureBuilder::new("c4", "B2").hp(0, 100).build(),
            ],
        ),
    ]);
    assert_eq!(
        determine_timeout_winner(&hp_ratio_state).as_deref(),
        Some("p1"),
        "when alive count ties, timeout should compare HP percentage"
    );
}

#[test]
fn p1_spec_learnset_moves_must_exist_in_move_db() {
    let move_db = MoveDatabase::load_from_yaml_file(Path::new("data/moves.yaml"))
        .expect("load moves.yaml");
    let learnsets = LearnsetDatabase::load_default().expect("load learnsets");

    let mut missing = Vec::new();
    for (species_id, moves) in learnsets.as_map() {
        for move_id in moves {
            if move_db.get(move_id).is_none() {
                missing.push(format!("{} -> {}", species_id, move_id));
            }
        }
    }

    assert!(
        missing.is_empty(),
        "undefined move ids in learnsets:\n{}",
        missing.join("\n")
    );
}

#[test]
fn p1_spec_effect_targets_use_supported_literals() {
    let move_db = MoveDatabase::load_from_yaml_file(Path::new("data/moves.yaml"))
        .expect("load moves.yaml");

    let mut invalid = Vec::new();
    for (move_id, move_data) in move_db.as_map() {
        walk_effects(&move_data.steps, &mut |effect| {
            if let Some(target) = effect.data.get("target").and_then(|v| v.as_str()) {
                if !is_allowed_target_literal(target) {
                    invalid.push(format!("{} -> {}", move_id, target));
                }
            }
        });
    }

    assert!(
        invalid.is_empty(),
        "unsupported target literals found:\n{}",
        invalid.join("\n")
    );
}

#[test]
fn p1_spec_effect_status_ids_use_supported_canonical_ids() {
    let move_db = MoveDatabase::load_from_yaml_file(Path::new("data/moves.yaml"))
        .expect("load moves.yaml");

    let mut invalid = Vec::new();
    for (move_id, move_data) in move_db.as_map() {
        walk_effects(&move_data.steps, &mut |effect| {
            if let Some(status_id) = effect.data.get("statusId").and_then(|v| v.as_str()) {
                if !is_supported_status_id(status_id) {
                    invalid.push(format!("{} -> {}", move_id, status_id));
                }
            }
        });
    }

    assert!(
        invalid.is_empty(),
        "unsupported status ids found:\n{}",
        invalid.join("\n")
    );
}

#[test]
fn p1_spec_ability_status_field_interaction_matrix() {
    let poison_move = MoveData {
        id: "poison_touch".to_string(),
        name: Some("Poison Touch".to_string()),
        move_type: Some("poison".to_string()),
        category: Some("status".to_string()),
        pp: Some(10),
        power: None,
        accuracy: Some(1.0),
        priority: Some(0),
        description: None,
        steps: vec![effect(
            "apply_status",
            json!({
                "statusId": "poison",
                "target": "target",
                "chance": 1
            }),
        )],
        tags: Vec::new(),
        crit_rate: None,
    };
    let engine = make_engine(vec![
        wait_move(),
        poison_move,
        damage_move("strike", "physical", 80, None),
    ]);

    let mut immunity_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "ImmunityMon")
                .moves(&["wait", "strike"])
                .ability("immunity")
                .hp(80, 100)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Poisoner")
                .moves(&["poison_touch"])
                .build()],
        ),
    ]);
    immunity_state.field.global.push(FieldEffect {
        id: "grassy_terrain".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });
    let immunity_actions = vec![
        move_action("p1", "wait", "p2"),
        move_action("p2", "poison_touch", "p1"),
    ];
    let immunity_next = run_turn_with_seed(&engine, &immunity_state, &immunity_actions, 301);
    assert_active_hp(&immunity_next, "p1", 86);
    let immunity_active = &immunity_next.players[0].team[immunity_next.players[0].active_slot];
    assert!(
        !immunity_active.statuses.iter().any(|s| s.id == "poison"),
        "immunity should block poison while grassy terrain still heals"
    );

    let mut normal_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "NormalMon")
                .moves(&["wait", "strike"])
                .hp(80, 100)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Poisoner")
                .moves(&["poison_touch"])
                .build()],
        ),
    ]);
    normal_state.field.global.push(FieldEffect {
        id: "grassy_terrain".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });
    let normal_next = run_turn_with_seed(&engine, &normal_state, &immunity_actions, 301);
    assert_active_has_status(&normal_next, "p1", "poison");
    assert_active_hp(&normal_next, "p1", 74);

    let mut levitate_state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "LevitateMon")
                .moves(&["wait"])
                .ability("levitate")
                .hp(80, 100)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Idle").moves(&["wait"]).build()],
        ),
    ]);
    levitate_state.field.global.push(FieldEffect {
        id: "grassy_terrain".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });
    let wait_actions = vec![move_action("p1", "wait", "p2"), move_action("p2", "wait", "p1")];
    let levitate_next = run_turn_with_seed(&engine, &levitate_state, &wait_actions, 302);
    assert_active_hp(
        &levitate_next,
        "p1",
        80,
    );

    let mut guts_base = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "GutsMon")
                .moves(&["strike"])
                .ability("guts")
                .stats(100, 60, 50, 50, 70)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Wall")
                .moves(&["wait"])
                .stats(60, 100, 50, 70, 50)
                .build()],
        ),
    ]);
    guts_base.field.global.push(FieldEffect {
        id: "reflect".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });
    let mut guts_burned = guts_base.clone();
    guts_burned.players[0].team[0]
        .statuses
        .push(status("burn", None));
    let strike_actions = vec![
        move_action("p1", "strike", "p2"),
        move_action("p2", "wait", "p1"),
    ];
    let base_next = run_turn_with_seed(&engine, &guts_base, &strike_actions, 303);
    let burned_next = run_turn_with_seed(&engine, &guts_burned, &strike_actions, 303);
    assert!(
        active_hp(&burned_next, "p2") < active_hp(&base_next, "p2"),
        "guts + status should increase physical damage output even when reflect is active"
    );
}

#[test]
fn p1_spec_end_turn_effect_ordering() {
    let engine = make_engine(vec![wait_move()]);

    let mut wish_status = status("wish", None);
    wish_status
        .data
        .insert("triggerTurn".to_string(), Value::Number(1.into()));
    wish_status
        .data
        .insert("healAmount".to_string(), Value::Number(20.into()));

    let leftovers_status = status("leftovers", None);

    let mut leech_seed = status("leech_seed", None);
    leech_seed
        .data
        .insert("sourceId".to_string(), Value::String("p2".to_string()));

    let poison_status = status("poison", None);

    let mut bind_status = status("bind", None);
    bind_status
        .data
        .insert("moveName".to_string(), Value::String("しめつける".to_string()));

    let curse_status = status("curse", None);

    let mut state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Anchor")
                .moves(&["wait"])
                .hp(70, 100)
                .with_status(wish_status)
                .with_status(leftovers_status)
                .with_status(leech_seed)
                .with_status(poison_status)
                .with_status(bind_status)
                .with_status(curse_status)
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Seeder")
                .moves(&["wait"])
                .hp(70, 100)
                .build()],
        ),
    ]);
    state.field.global.push(FieldEffect {
        id: "grassy_terrain".to_string(),
        remaining_turns: Some(5),
        data: HashMap::new(),
    });

    let actions = vec![move_action("p1", "wait", "p2"), move_action("p2", "wait", "p1")];
    let next = run_turn_with_seed(&engine, &state, &actions, 401);

    assert_active_hp(&next, "p1", 39);
    assert_active_hp(&next, "p2", 88);

    let find_log_index = |needle: &str| {
        next.log
            .iter()
            .position(|line| line.contains(needle))
            .unwrap_or_else(|| panic!("log entry containing '{}' was not found", needle))
    };
    let wish_i = find_log_index("ねがいごとが かなった");
    let grassy_i = find_log_index("グラスフィールドの 恩恵を 受けている");
    let leftovers_i = find_log_index("たべのこしで 少し回復した");
    let leech_i = find_log_index("宿り木の種が");
    let poison_i = find_log_index("どくの ダメージを 受けている");
    let bind_i = find_log_index("しめつけるの ダメージを受けている");
    let curse_i = find_log_index("呪われている");

    assert!(
        wish_i < grassy_i
            && grassy_i < leftovers_i
            && leftovers_i < leech_i
            && leech_i < poison_i
            && poison_i < bind_i
            && bind_i < curse_i,
        "end-turn effects should resolve in the documented order"
    );
}

#[test]
fn p1_spec_manual_reason_uses_approved_taxonomy() {
    let move_db = MoveDatabase::load_from_yaml_file(Path::new("data/moves.yaml"))
        .expect("load moves.yaml");
    let allowed_prefixes = [
        "Switching",
        "No supported effects inferred",
        "Multi-turn trapping/binding effects are not fully supported",
        "Unsupported ailment",
    ];

    let mut invalid = Vec::new();
    for (move_id, move_data) in move_db.as_map() {
        walk_effects(&move_data.steps, &mut |effect| {
            if effect.effect_type != "manual" {
                return;
            }
            let reason = effect
                .data
                .get("manualReason")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !allowed_prefixes
                .iter()
                .any(|prefix| reason.starts_with(prefix))
            {
                invalid.push(format!("{} -> {}", move_id, reason));
            }
        });
    }

    assert!(
        invalid.is_empty(),
        "manualReason out of taxonomy:\n{}",
        invalid.join("\n")
    );
}

#[test]
fn p2_case_registry_integrity() {
    let mut seen = HashSet::new();
    for case in CASES {
        assert!(seen.insert(case.id), "duplicate case id: {}", case.id);
    }

    assert!(
        CASES.iter().any(|case| case.priority == Priority::P0),
        "registry must include P0 cases"
    );
    assert!(
        CASES.iter().any(|case| case.priority == Priority::P1),
        "registry must include P1 cases"
    );
    assert!(
        CASES.iter().any(|case| case.priority == Priority::P2),
        "registry must include P2 cases"
    );
    assert!(
        CASES.iter().any(|case| case.enabled),
        "registry must include enabled cases"
    );
    assert!(
        CASES.iter().any(|case| !case.enabled) || CASES.iter().all(|case| case.enabled),
        "registry should either keep backlog cases or mark all cases enabled"
    );
}

#[test]
fn p2_case_registry_is_synced_with_markdown_table() {
    let doc = include_str!("P0_P2_TEST_CASES.md");
    for case in CASES {
        assert!(
            doc.contains(case.id),
            "missing case id '{}' in P0_P2_TEST_CASES.md",
            case.id
        );
    }
}

#[test]
fn p2_spec_double_battle_model_smoke() {
    let chip = MoveData {
        id: "chip".to_string(),
        name: Some("Chip".to_string()),
        move_type: Some("normal".to_string()),
        category: Some("physical".to_string()),
        pp: Some(10),
        power: None,
        accuracy: Some(1.0),
        priority: Some(0),
        description: None,
        steps: vec![effect("damage_ratio", json!({ "ratioMaxHp": 0.25 }))],
        tags: Vec::new(),
        crit_rate: None,
    };
    let engine = make_engine(vec![chip, wait_move()]);

    let state = battle_state(vec![
        player(
            "p1",
            "P1",
            vec![CreatureBuilder::new("c1", "Attacker")
                .moves(&["chip"])
                .build()],
        ),
        player(
            "p2",
            "P2",
            vec![CreatureBuilder::new("c2", "Defender")
                .moves(&["wait"])
                .build()],
        ),
    ]);

    // P2 smoke: if a doubles-like action list provides two actions for one side,
    // single-battle mode must not let the same active creature act twice.
    let actions = vec![
        move_action("p1", "chip", "p2"),
        move_action("p1", "chip", "p2"),
        move_action("p2", "wait", "p1"),
    ];
    let next = run_turn_with_seed(&engine, &state, &actions, 551);

    assert_active_hp(&next, "p2", 75);
    assert!(
        next.log
            .iter()
            .any(|line| line.contains("追加アクション") && line.contains("無視")),
        "engine should log that duplicate per-player actions are ignored in single-battle mode"
    );
}
