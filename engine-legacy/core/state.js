/**
 * @typedef {Object} CreatureState
 * @property {string} id
 * @property {string} speciesId
 * @property {string} name
 * @property {number} level
 * @property {string[]} types
 * @property {string[]} moves
 * @property {string} ability
 * @property {string|null} item
 * @property {number} hp
 * @property {number} maxHp
 * @property {Object} stages
 * @property {Object[]} statuses
 * @property {Object} abilityData
 * @property {Object} movePp
 * @property {number} attack
 * @property {number} defense
 * @property {number} spAttack
 * @property {number} spDefense
 * @property {number} speed
 */

/**
 * @typedef {Object} PlayerState
 * @property {string} id
 * @property {string} name
 * @property {CreatureState[]} team
 * @property {number} activeSlot
 */

/**
 * @typedef {Object} FieldState
 * @property {Object[]} global
 * @property {Object} sides
 */

/**
 * @typedef {Object} BattleState
 * @property {PlayerState[]} players
 * @property {FieldState} field
 * @property {number} turn
 * @property {string[]} log
 * @property {Object} history
 */

function createBattleState(players) {
  return {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team, // Expecting array of creatures
      activeSlot: 0, // Default to first slot
    })),
    field: {
      global: [],
      sides: {},
    },
    turn: 0,
    log: [],
    history: null,
  };
}

module.exports = {
  createBattleState,
};
