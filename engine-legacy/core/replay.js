const { stepBattle } = require("./battle");

/**
 * Replay a battle deterministically from recorded history.
 * @param {import("./state").BattleState} initialState
 * @param {import("./state").BattleHistory} history
 * @returns {import("./state").BattleState}
 */
function replayBattle(initialState, history) {
  let next = structuredClone(initialState);
  for (const turn of history?.turns ?? []) {
    let idx = 0;
    const rng = () => {
      const v = turn.rng?.[idx];
      idx += 1;
      return v ?? Math.random();
    };
    next = stepBattle(next, turn.actions ?? [], rng, { recordHistory: false });
  }
  return next;
}

module.exports = { replayBattle };
