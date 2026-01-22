const { stepBattle, isBattleOver } = require("../core/battle");
const { moves } = require("../data/moves");
const { getActiveCreature } = require("../core/utils");

/**
 * Choose the move with highest nominal power for the active creature.
 * @param {import("../core/state").BattleState} state
 * @param {string} playerId
 * @returns {{playerId: string, moveId: string, targetId?: string}|null}
 */
function chooseHighestPower(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  const active = getActiveCreature(state, playerId);
  if (!player) return null;

  // If active pokemon is fainted or needs to switch, choose a random alive backup
  if (!active || active.hp <= 0 || active.statuses.some(s => s.id === "pending_switch")) {
      const backupIndex = player.team.findIndex((p, i) => p.hp > 0 && i !== player.activeSlot);
      if (backupIndex >= 0) {
          return { type: "switch", playerId, slot: backupIndex };
      }
      if (!active || active.hp <= 0) return { type: "wait", playerId };
  }

  const targetId = state.players.find((p) => p.id !== playerId)?.id;
  if (!targetId) return null;

  let bestMoveId = active.moves[0];
  let bestPower = -Infinity;
  for (const moveId of active.moves) {
    const move = moves[moveId];
    if (!move) continue;
    const power = (move.effects || [])
      .filter((e) => e.type === "damage")
      .reduce((max, e) => Math.max(max, e.power ?? 0), -Infinity);
    if (power > bestPower) {
      bestPower = power;
      bestMoveId = moveId;
    }
  }
  return { type: "move", playerId, moveId: bestMoveId, targetId };
}

/**
 * Run an auto battle until completion.
 * @param {import("../core/state").BattleState} state
 * @param {() => number} rng
 * @param {(state: import("../core/state").BattleState, playerId: string) => Object} chooser
 * @returns {import("../core/state").BattleState}
 */
function runAutoBattle(state, rng = Math.random, chooser = chooseHighestPower) {
  let next = state;
  let turns = 0;
  while (!isBattleOver(next) && turns < 100) {
    turns++;
    const actions = [];
    for (const player of next.players) {
      const action = chooser(next, player.id);
      if (action) actions.push(action);
    }
    if (actions.length === 0) break;
    next = stepBattle(next, actions, rng);
  }
  return next;
}

module.exports = { chooseHighestPower, runAutoBattle };
