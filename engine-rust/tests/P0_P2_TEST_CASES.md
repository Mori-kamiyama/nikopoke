# P0-P2 Test Cases

## Purpose
- Keep priority-based conformance cases visible in CI.
- Run `enabled` cases now.
- Unignore backlog cases as engine/data gaps are fixed.

## Cases

| Case ID | Priority | Status | Rust Test |
|---|---|---|---|
| `P0-CRIT-DEF-STAGE-IGNORE` | P0 | enabled | `p0_crit_ignores_positive_def_stage` |
| `P0-CRIT-ATK-STAGE-IGNORE` | P0 | enabled | `p0_spec_crit_ignores_negative_attack_stage` |
| `P0-CRIT-WALL-BYPASS` | P0 | enabled | `p0_spec_crit_bypasses_walls_while_non_crit_does_not` |
| `P0-FIELD-STATUS-ATTACH` | P0 | enabled | `p0_field_status_move_sets_status_on_field` |
| `P0-DAMAGE-ROLL-GOLDEN` | P0 | enabled | `p0_spec_damage_roll_matches_golden_fixture` |
| `P0-TRICK-ROOM-ORDER` | P0 | enabled | `p0_spec_trick_room_reverses_action_order` |
| `P0-REFLECT-DAMAGE` | P0 | enabled | `p0_spec_reflect_reduces_physical_damage` |
| `P0-LIGHT-SCREEN-DAMAGE` | P0 | enabled | `p0_spec_light_screen_reduces_special_damage` |
| `P0-TAILWIND-SPEED` | P0 | enabled | `p0_spec_tailwind_changes_action_order_by_speed` |
| `P0-TOXIC-RESIDUAL` | P0 | enabled | `p0_spec_toxic_damage_scales_each_turn` |
| `P0-TOXIC-SWITCH-RESET` | P0 | enabled | `p0_spec_toxic_resets_counter_after_switch` |
| `P0-PROTECT-CHAIN-PROB` | P0 | enabled | `p0_spec_protect_chain_probability_is_one_third_then_one_ninth` |
| `P0-SLEEP-SWITCH` | P0 | enabled | `p0_spec_sleep_persists_when_switched_out` |
| `P0-MANUAL-NOOP-GATE` | P0 | enabled | `p0_manual_effects_must_not_be_silent_noop` |
| `P0-WIN-SIMULTANEOUS-FAINT` | P0 | enabled | `p0_spec_simultaneous_faint_resolution_rule` |
| `P0-WIN-TIMEOUT-RULE` | P0 | enabled | `p0_spec_timeout_resolution_rule` |
| `P1-LEARNSET-MOVE-REF` | P1 | enabled | `p1_spec_learnset_moves_must_exist_in_move_db` |
| `P1-TARGET-LITERAL-LINT` | P1 | enabled | `p1_spec_effect_targets_use_supported_literals` |
| `P1-STATUS-ID-LINT` | P1 | enabled | `p1_spec_effect_status_ids_use_supported_canonical_ids` |
| `P1-ABILITY-STATUS-FIELD` | P1 | enabled | `p1_spec_ability_status_field_interaction_matrix` |
| `P1-ENDTURN-ORDER` | P1 | enabled | `p1_spec_end_turn_effect_ordering` |
| `P1-MANUAL-REASON-TAXONOMY` | P1 | enabled | `p1_spec_manual_reason_uses_approved_taxonomy` |
| `P2-CASE-REGISTRY-INTEGRITY` | P2 | enabled | `p2_case_registry_integrity` |
| `P2-CASE-DOC-SYNC` | P2 | enabled | `p2_case_registry_is_synced_with_markdown_table` |
| `P2-DOUBLE-MODEL-SMOKE` | P2 | enabled | `p2_spec_double_battle_model_smoke` |

## How to run

- Enabled only:
  - `cargo test --test spec_priority_cases`
- Include ignored backlog cases:
  - `cargo test --test spec_priority_cases -- --ignored`

## Promotion rule

1. Fix engine/data gap for one case.
2. Remove `#[ignore]` from that case.
3. Add/adjust assertions if spec wording changed.
4. Keep the table above synchronized.
