/**
 * @typedef {Object} BaseStats
 * @property {number} hp
 * @property {number} atk
 * @property {number} def
 * @property {number} spa
 * @property {number} spd
 * @property {number} spe
 */

/**
 * @typedef {Object} SpeciesData
 * @property {string} id
 * @property {string} name
 * @property {string[]} types
 * @property {BaseStats} baseStats
 * @property {string[]} abilities
 */

const { learnsets } = require("../data/learnsets");
const { moves } = require("../data/moves");

/**
 * Calculates the actual stat value at Level 50.
 * Assumes IV=31, EV=0, Neutral Nature for simplicity unless specified.
 * 
 * @param {number} base
 * @param {boolean} isHp
 * @param {number} iv (default 31)
 * @param {number} ev (default 0)
 * @returns {number}
 */
function calcStat(base, isHp, iv = 31, ev = 0) {
  const level = 50;
  if (isHp) {
    return Math.floor(((base * 2 + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  } else {
    return Math.floor(((base * 2 + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  }
}

/**
 * Validate requested moves against the configured learnset.
 * Throws if any move is unknown or not allowed for the species.
 *
 * @param {string} speciesId
 * @param {string[]} requestedMoves
 * @returns {string[]}
 */
function validateMoves(speciesId, requestedMoves = []) {
  if (!requestedMoves.length) return [];
  const learnable = learnsets[speciesId];
  if (!learnable) {
    throw new Error(`No learnset found for species '${speciesId}'.`);
  }

  const learnableSet = new Set(learnable);
  const unknownMoves = requestedMoves.filter((id) => !moves[id]);
  if (unknownMoves.length) {
    throw new Error(
      `Unknown move id(s) for species '${speciesId}': ${unknownMoves.join(", ")}`
    );
  }

  const invalid = requestedMoves.filter((id) => !learnableSet.has(id));
  if (invalid.length) {
    throw new Error(
      `Move(s) not allowed for species '${speciesId}': ${invalid.join(", ")}`
    );
  }

  return requestedMoves;
}

/**
 * Creates a battle-ready creature instance from species data.
 * @param {SpeciesData} species
 * @param {Object} options
 * @param {string[]} [options.moves] - List of move IDs
 * @param {string} [options.ability] - Chosen ability ID (defaults to first in list)
 * @param {string} [options.name] - Nickname (defaults to species name)
 * @param {number} [options.level] - Level (defaults to 50)
 * @returns {import("./state").CreatureState}
 */
function createCreature(species, options = {}) {
  const level = options.level ?? 50; // Although calculation is currently fixed to Lv50 logic
  const iv = 31;
  const ev = 0;
  
  const types = species.types ?? species.type ?? [];

  const stats = {
    hp: calcStat(species.baseStats.hp, true, iv, ev),
    atk: calcStat(species.baseStats.atk, false, iv, ev),
    def: calcStat(species.baseStats.def, false, iv, ev),
    spa: calcStat(species.baseStats.spa, false, iv, ev),
    spd: calcStat(species.baseStats.spd, false, iv, ev),
    spe: calcStat(species.baseStats.spe, false, iv, ev),
  };

  return {
    id: `${species.id}_${Math.random().toString(36).slice(2, 7)}`, // Unique ID for battle instance
    name: options.name ?? species.name,
    speciesId: species.id,
    level: level,
    types: [...types],
    moves: validateMoves(species.id, options.moves ?? []),
    ability: options.ability ?? species.abilities?.[0] ?? "none",
    item: options.item ?? null,
    
    // Dynamic Battle State
    hp: stats.hp,
    maxHp: stats.hp,
    status: null, // Primary status (burn, paralysis, etc.)
    statuses: [], // Volatile statuses
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
    movePp: {},
    
    // Stats (can be modified by items/abilities, but here are the base values for the battle)
    attack: stats.atk,
    defense: stats.def,
    spAttack: stats.spa,
    spDefense: stats.spd,
    speed: stats.spe,
    
    abilityData: {}, // Storage for ability flags
    volatileData: {}, // Storage for temporary battle data (protect counter, etc.)
  };
}

module.exports = {
  createCreature,
  calcStat,
};
