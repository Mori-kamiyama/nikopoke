# engine-rust

A Rust reimplementation of the battle engine with a minimal, deterministic core loop.

## Status

This is a first-pass port focused on state management, turn ordering, and basic damage.
Abilities, statuses, and complex move effects are not yet implemented.

## API (library)

- `create_battle_state(players)`
- `step_battle(state, actions, rng, options)`
- `is_battle_over(state)`
- `replay_battle(initial_state, history)`
- `choose_highest_power(state, player_id)`
- `get_best_move_minimax(state, player_id, depth)`
- `get_best_move_mcts(state, player_id, iterations)`

## Notes

- The default move database is intentionally small (`MoveDatabase::minimal`).
- For a larger move set, export JSON with `node engine-rust/tools/export_moves_json.js` and load it with `MoveDatabase::load_from_json_file`, then construct a `BattleEngine` with it.

## WASM (Demo)

To use the Rust engine from the demo server, build the WASM package and ensure `engine-rust/pkg` exists:

```bash
wasm-pack build --target nodejs
```

The demo server loads `engine-rust/pkg` directly, so rebuild after Rust changes.

## Status/Ability Support

Basic status hooks (burn/poison/paralysis/sleep/freeze/confusion/flinch/protect/etc.) and a subset of ability hooks have been ported from the JS engine. Some advanced interactions may still be missing.
