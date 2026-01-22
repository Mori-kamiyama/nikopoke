---
name: nikopoke-move-dsl
description: Skill for describing and implementing new moves using the Nikopoke move DSL. Use when adding, modifying, or analyzing moves in the Pokemon battle engine. Supports generating JSON entries for data/moves.json, understanding effect types (damage, chance, conditional, etc.), and validating move definitions.
---

# Nikopoke Move DSL

This skill enables precise implementation of Pokemon-style moves within the Nikopoke engine using its custom JSON DSL.

## Core Reference

See [dsl-reference.md](references/dsl-reference.md) for a comprehensive list of:
- Required core fields (`id`, `name`, `type`, `category`, etc.)
- Available `effects` types (`damage`, `modify_stage`, `chance`, `conditional`, etc.)
- Supported tags (`contact`, `sound`, etc.)
- Validation rules

## Quick Start / Examples

For common move patterns (Physical, Special with Status, Boosting, Multi-hit), see [examples.md](references/examples.md).

## Workflow: Adding a New Move

1. **Define the Move**: Describe the move in Japanese (Name, Type, Category, Power, Accuracy, PP, Effect).
2. **Generate JSON**:
   - Use this skill's knowledge to craft the JSON entry.
   - Ensure the first effect for attack moves is `"type": "damage"`.
   - Convert percentage accuracy to decimal (0.0 - 1.0).
   - Use snake_case for the `id`.
3. **Insert into Database**: Add the new entry to `data/moves.json`.
4. **Validate**:
   - Ensure all required fields are present.
   - Check that `category` and `type` use valid lowercase strings.
5. **Test in Engine**:
   - Run `cargo run --bin battle-cli` to verify the move behavior in a simulated battle.

## Common Pitfalls
- **Incorrect Accuracy**: Remember that 100% accuracy is `1.0`, not `100`.
- **Missing Damage Effect**: Every move with a `power` value MUST have a `damage` effect in its `effects` array.
- **Wrong Target**: Always specify `"target": "self"` or `"target": "target"` for status effects and stat modifiers.
- **String vs Object in Conditions**: In `conditional` or `if`, use an object like `{"type": "user_has_status", ...}`, never a plain string.
