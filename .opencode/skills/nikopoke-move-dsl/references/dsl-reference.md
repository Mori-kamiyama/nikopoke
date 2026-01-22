# Nikopoke Move DSL Reference

This document provides a detailed reference for the move DSL used in `data/moves.json`.

## Core Fields

- `id`: (String) Unique identifier in snake_case (e.g., `morning_sun`).
- `name`: (String) Display name in Japanese.
- `type`: (String) Move type (e.g., `normal`, `fire`, `water`, etc.).
- `category`: (String) `physical`, `special`, or `status`.
- `pp`: (Number) Power Points.
- `power`: (Number | null) Base power. `null` for status moves.
- `accuracy`: (Number | null) Accuracy from 0.0 to 1.0. `null` for moves that never miss.
- `priority`: (Number) Move priority (default 0).
- `description`: (String) Japanese description of the move.
- `effects`: (Array) Array of effect objects.
- `tags`: (Array) Optional tags like `contact`, `sound`, `punch`, `slice`, etc.

## Effect Types

### Damage Effects
- `{"type": "damage", "power": 40, "accuracy": 1.0}`: Standard damage.
- `{"type": "damage_ratio", "ratioMaxHp": 0.5, "target": "target"}`: Damage based on max HP (0.5 = 50%). Negative ratio heals.
- `{"type": "ohko", "baseAccuracy": 0.3}`: One-hit KO move.

### Stat Modifiers
- `{"type": "modify_stage", "target": "self", "stages": {"atk": 1}}`: Change capability ranks.
  - Valid stats: `atk`, `def`, `spa`, `spd`, `spe`, `accuracy`, `evasion`.

### Status Effects
- `{"type": "apply_status", "statusId": "burn", "chance": 0.1, "target": "target"}`: Apply status ailment.
  - Status IDs: `burn`, `paralysis`, `sleep`, `poison`, `bad_poison`, `freeze`, `confusion`, `flinch`.
- `{"type": "remove_status", "target": "self"}`: Clear status ailments.

### Control Flow
- `{"type": "chance", "p": 0.3, "then": [...], "else": [...]}`: Execute effects with probability `p`.
- `{"type": "conditional", "if": { "type": "target_has_status", "statusId": "poison" }, "then": [...], "else": [...]}`: Branching logic.
  - Condition Types: `target_has_status`, `user_has_status`, `field_has_status`, `target_hp_lt`, `weather_is_sunny`, `user_type`.
- `{"type": "repeat", "times": {"min": 2, "max": 5}, "effects": [...]}`: Repeat effects multiple times.

### Others
- `{"type": "protect"}`: Protect the user from moves.
- `{"type": "delay", "afterTurns": 1, "effects": [...]}`: Delayed execution (e.g., Future Sight).
- `{"type": "over_time", "duration": 5, "effects": [...]}`: Effect that lasts for multiple turns.
- `{"type": "force_switch"}`: Force the target to switch out.
- `{"type": "apply_field_status", "statusId": "stealth_rock"}`: Apply entry hazards or weather/terrain.
- `{"type": "self_switch"}`: User switches out after using the move.

## Validation Rules
1. Every move must have all required fields.
2. Attack moves (with power) must have a `damage` effect as the first entry in the `effects` array.
3. Use `null` instead of `-` for accuracy and power.
4. Accuracy must be a float (100% -> 1.0).
5. Add `contact` tag for physical contact moves.
6. Add `sound` tag for sound-based moves.
