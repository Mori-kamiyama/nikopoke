const { stageMultiplier } = require("../core/utils");

/**
 * Evaluate the battle state from the perspective of playerId.
 * Returns a higher score if the state is favorable.
 * @param {import("../core/state").BattleState} state
 * @param {string} playerId
 * @returns {number}
 */
function evaluateState(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  const opponent = state.players.find((p) => p.id !== playerId);

  if (!player || !opponent) return 0;

  // Win/Loss check
  const playerAlive = player.team.some((c) => c.hp > 0);
  const opponentAlive = opponent.team.some((c) => c.hp > 0);

  if (!playerAlive && opponentAlive) return -10000;
  if (playerAlive && !opponentAlive) return 10000;
  if (!playerAlive && !opponentAlive) return -5000;

  let score = 0;

  score += calculatePlayerScore(player);
  score -= calculatePlayerScore(opponent);

  return score;
}

function calculatePlayerScore(player) {
  let score = 0;
  
  for (const creature of player.team) {
    if (creature.hp <= 0) continue;

    // HP Ratio (0-100 per pokemon)
    score += (creature.hp / creature.maxHp) * 100;

    // Survival Bonus
    score += 50;

    // Stat Stages
    if (creature.stages) {
        for (const val of Object.values(creature.stages)) {
            // Cap effective value to avoid infinity
            score += val * 10;
        }
    }

    // Status Ailments
    if (creature.statuses) {
        for (const status of creature.statuses) {
             if (["poison", "burn", "paralysis", "sleep", "freeze"].includes(status.id)) {
                 score -= 20;
             }
        }
    }
  }
  
  return score;
}

module.exports = { evaluateState };
