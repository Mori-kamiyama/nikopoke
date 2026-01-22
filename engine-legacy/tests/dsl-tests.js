const assert = require("assert");
const { createBattleState } = require("../core/state");
const { stepBattle } = require("../core/battle");
const { moves } = require("../data/moves");

function registerMove(id, def) {
  moves[id] = { id, name: id, ...def };
}

function makeCreature(name, moveIds, overrides = {}) {
  // Return a team array with one creature
  const c = {
    id: name.toLowerCase(),
    name,
    level: 50,
    maxHp: 100,
    hp: 100, // Explicitly set HP
    attack: 50,
    defense: 50,
    spAttack: 50,
    spDefense: 50,
    speed: 10,
    moves: moveIds,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, // Init stages
    statuses: [],
    ...overrides,
  };
  return [c];
}

function makeRng(sequence) {
  let i = 0;
  return () => {
    const v = sequence[i];
    i = Math.min(sequence.length - 1, i + 1);
    return v ?? 0;
  };
}

function getPlayer(state, id) {
  return state.players.find((p) => p.id === id);
}

function getActive(state, playerId) {
    const p = getPlayer(state, playerId);
    return p.team[p.activeSlot];
}

function hasStatus(state, playerId, statusId) {
  const active = getActive(state, playerId);
  return active?.statuses.some((s) => s.id === statusId);
}

function expectedDamage(power, atk = 50, def = 50, level = 50, rand = 1) {
  const base = (((level * 2) / 5 + 2) * power * atk) / def / 50 + 2;
  const roll = 0.85 + (1 - 0.85) * rand;
  return Math.max(1, Math.floor(base * roll));
}

function expectedDamageCrit(power, atk = 50, def = 50, level = 50, rand = 1) {
  const base = (((level * 2) / 5 + 2) * power * atk) / def / 50 + 2;
  const roll = 0.85 + (1 - 0.85) * rand;
  return Math.max(1, Math.floor(base * roll * 1.5));
}

function expectedDamageTyped(power, modifiers, atk = 50, def = 50, level = 50, rand = 1) {
  const base = (((level * 2) / 5 + 2) * power * atk) / def / 50 + 2;
  const roll = 0.85 + (1 - 0.85) * rand;
  return Math.max(1, Math.floor(base * roll * modifiers));
}

function runCase(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Case 1: apply_status
registerMove("toxic_spore", {
  effects: [{ type: "apply_status", statusId: "poison", target: "target" }],
});
runCase("Case1: toxic_spore applies poison", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["toxic_spore"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "toxic_spore", targetId: "p2" }],
    makeRng([0])
  );
  assert(hasStatus(next, "p2", "poison"), "poison should be applied");
});

// Case 2: chance status
registerMove("fire_blast_test", {
  effects: [
    { type: "damage", power: 110, accuracy: 1 },
    { type: "apply_status", statusId: "burn", chance: 0.1, target: "target" },
  ],
});
runCase("Case2: fire_blast burn succeeds at low RNG", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["fire_blast_test"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0, 1, 0.05]); // hit, max damage roll, burn proc
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "fire_blast_test", targetId: "p2" }],
    rng
  );
  assert(hasStatus(next, "p2", "burn"), "burn should be applied");
});
runCase("Case2: fire_blast burn fails at high RNG", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["fire_blast_test"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0, 1, 0.5]); // hit, max damage, burn fail
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "fire_blast_test", targetId: "p2" }],
    rng
  );
  assert(!hasStatus(next, "p2", "burn"), "burn should not be applied");
});

// Case 3: swords dance self buff
registerMove("swords_dance_test", {
  effects: [
    { type: "modify_stage", target: "self", stages: { atk: 2 } },
  ],
});
runCase("Case3: swords dance raises atk by 2", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["swords_dance_test"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "swords_dance_test", targetId: "p2" }],
    makeRng([0])
  );
  assert.strictEqual(getActive(next, "p1").stages.atk, 2);
});
runCase("Case3: swords dance clamps at +6", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["swords_dance_test"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  getActive(state, "p1").stages.atk = 6;
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "swords_dance_test", targetId: "p2" }],
    makeRng([0])
  );
  assert.strictEqual(getActive(next, "p1").stages.atk, 6);
});

// Case 4: growl lowers target attack
registerMove("growl_test", {
  effects: [
    { type: "modify_stage", target: "target", stages: { atk: -1 } },
  ],
});
runCase("Case4: growl lowers target attack", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["growl_test"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "growl_test", targetId: "p2" }],
    makeRng([0])
  );
  assert.strictEqual(getActive(next, "p2").stages.atk, -1);
});

// Case 5: conditional damage
registerMove("venoshock_like", {
  effects: [
    {
      type: "conditional",
      if: { type: "target_has_status", statusId: "poison" },
      then: [{ type: "damage", power: 120 }],
      else: [{ type: "damage", power: 60 }],
    },
  ],
});
runCase("Case5A: venoshock_like doubles vs poisoned target", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["venoshock_like"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  getActive(state, "p2").statuses.push({
    id: "poison",
    remainingTurns: null,
    data: {},
  });
  const rng = makeRng([1]); // max damage roll
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "venoshock_like", targetId: "p2" }],
    rng
  );
  const poisonTick = Math.floor(100 * 0.125); // Poison damage updated in logic to 1/8
  const expected = 100 - expectedDamage(120) - poisonTick;
  assert.strictEqual(getActive(next, "p2").hp, expected);
});
runCase("Case5B: venoshock_like base power when not poisoned", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["venoshock_like"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "venoshock_like", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(60);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Case 6: sharpness boosts slicing moves
registerMove("slash_test", {
  effects: [{ type: "damage", power: 70, accuracy: 1 }],
  tags: ["slicing"],
});
runCase("Case6: sharpness boosts slicing power by 1.5x", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Cutter", ["slash_test"], {
        ability: "sharpness",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "slash_test", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(70 * 1.5, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Case 7: pure power doubles physical damage
registerMove("pure_power_strike", {
  effects: [{ type: "damage", power: 50, accuracy: 1 }],
});
runCase("Ability1: pure power doubles physical power", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Fighter", ["pure_power_strike"], {
        ability: "pure_power",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "pure_power_strike", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(50 * 2, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Case 8: hustle reduces accuracy
registerMove("hustle_strike", {
  effects: [{ type: "damage", power: 70, accuracy: 1 }],
});
runCase("Ability2: hustle causes miss at 0.85 roll", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Hustler", ["hustle_strike"], {
        ability: "hustle",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0.85]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "hustle_strike", targetId: "p2" }],
    rng
  );
  assert.strictEqual(getActive(next, "p2").hp, 100);
});

// Case 9: technician boosts low power moves
registerMove("tech_strike", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
});
runCase("Ability3: technician boosts power <= 60", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Tech", ["tech_strike"], {
        ability: "technician",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "tech_strike", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(60 * 1.5, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Case 10: steelworker boosts steel moves
registerMove("steel_strike", {
  effects: [{ type: "damage", power: 70, accuracy: 1 }],
  type: "steel",
});
runCase("Ability4: steelworker boosts steel moves", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Anchor", ["steel_strike"], {
        ability: "steelworker",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "steel_strike", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(70 * 1.5, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Case 11: contrary inverts stage changes
registerMove("contrary_buff", {
  effects: [{ type: "modify_stage", target: "self", stages: { atk: 1 } }],
});
runCase("Ability5: contrary flips boost to drop", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Tricky", ["contrary_buff"], {
        ability: "contrary",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "contrary_buff", targetId: "p2" }],
    makeRng([0])
  );
  assert.strictEqual(getActive(next, "p1").stages.atk, -1);
});

// Case 12: simple doubles stage changes
registerMove("simple_buff", {
  effects: [{ type: "modify_stage", target: "self", stages: { atk: 1 } }],
});
runCase("Ability6: simple doubles stage boosts", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Simple", ["simple_buff"], {
        ability: "simple",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "simple_buff", targetId: "p2" }],
    makeRng([0])
  );
  assert.strictEqual(getActive(next, "p1").stages.atk, 2);
});

// Case 13: magic bounce reflects status moves
registerMove("poison_spore", {
  effects: [{ type: "apply_status", statusId: "poison", target: "target" }],
  category: "status",
});
runCase("Ability7: magic bounce reflects poison", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Caster", ["poison_spore"]),
    },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Bouncer", ["tackle"], {
        ability: "magic_bounce",
      }),
    },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "poison_spore", targetId: "p2" }],
    makeRng([0])
  );
  assert(hasStatus(next, "p1", "poison"), "poison should bounce to caster");
  assert(!hasStatus(next, "p2", "poison"), "target should remain clean");
});

// Case 14: lightning rod absorbs electric damage
registerMove("spark_test", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
  type: "electric",
});
runCase("Ability8: lightning rod cancels damage and boosts spA", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Caster", ["spark_test"]),
    },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Rod", ["tackle"], {
        ability: "lightning_rod",
      }),
    },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "spark_test", targetId: "p2" }],
    makeRng([0, 1])
  );
  assert.strictEqual(getActive(next, "p2").hp, 100);
  assert.strictEqual(getActive(next, "p2").stages.spa, 1);
});

// Case 15: stamina raises defense when hit
registerMove("stamina_hit", {
  effects: [{ type: "damage", power: 40, accuracy: 1 }],
});
runCase("Ability9: stamina boosts defense after damage", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Caster", ["stamina_hit"]),
    },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Tank", ["tackle"], {
        ability: "stamina",
      }),
    },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "stamina_hit", targetId: "p2" }],
    makeRng([0, 1])
  );
  assert.strictEqual(getActive(next, "p2").stages.def, 1);
});

// Case 16: prankster raises status move priority
registerMove("prankster_status", {
  effects: [{ type: "modify_stage", target: "self", stages: { def: 1 } }],
  category: "status",
});
registerMove("fast_hit", {
  effects: [{ type: "damage", power: 40, accuracy: 1 }],
});
runCase("Ability10: prankster acts before faster foe", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Prank", ["prankster_status"], {
        ability: "prankster",
        speed: 5,
      }),
    },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Fast", ["fast_hit"], { speed: 50 }),
    },
  ]);
  const next = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "prankster_status", targetId: "p1" },
      { playerId: "p2", moveId: "fast_hit", targetId: "p1" },
    ],
    makeRng([0, 1, 0])
  );
  const order = next.history.turns[0].actions;
  assert.strictEqual(order[0].playerId, "p1");
});

// Case 17: type effectiveness and STAB
registerMove("fire_blast_type", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
  type: "fire",
});
runCase("Type1: fire STAB + super effective vs grass", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Pyro", ["fire_blast_type"], { types: ["fire"] }),
    },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Leaf", ["tackle"], { types: ["grass"] }),
    },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "fire_blast_type", targetId: "p2" }],
    makeRng([0, 1])
  );
  const modifiers = 1.5 * 2;
  const expected = 100 - expectedDamageTyped(60, modifiers, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

registerMove("water_pulse_type", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
  type: "water",
});
runCase("Type2: water STAB + resisted vs water", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Aqua", ["water_pulse_type"], { types: ["water"] }),
    },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Aqua2", ["tackle"], { types: ["water"] }),
    },
  ]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "water_pulse_type", targetId: "p2" }],
    makeRng([0, 1])
  );
  const modifiers = 1.5 * 0.5;
  const expected = 100 - expectedDamageTyped(60, modifiers, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

function runTypeCase(label, moveType, targetType, multiplier) {
  const moveId = `type_case_${label}`;
  registerMove(moveId, {
    effects: [{ type: "damage", power: 60, accuracy: 1 }],
    type: moveType,
  });
  runCase(`TypeCase${label}: ${moveType} -> ${targetType}`, () => {
    const state = createBattleState([
      {
        id: "p1",
        name: "A",
        team: makeCreature("Caster", [moveId], { types: ["typeless"] }),
      },
      {
        id: "p2",
        name: "B",
        team: makeCreature("Target", ["tackle"], { types: [targetType] }),
      },
    ]);
    const next = stepBattle(
      state,
      [{ playerId: "p1", moveId, targetId: "p2" }],
      makeRng([0, 1])
    );
    const expectedDamageValue =
      multiplier === 0
        ? 0
        : expectedDamageTyped(60, multiplier, 50, 50, 50, 1);
    const expected = Math.max(0, 100 - expectedDamageValue);
    assert.strictEqual(getActive(next, "p2").hp, expected);
  });
}

runTypeCase("1", "electric", "ground", 0);
runTypeCase("2", "fire", "grass", 2);
runTypeCase("3", "normal", "rock", 0.5);
runTypeCase("4", "dragon", "dragon", 2);
runTypeCase("5", "fairy", "steel", 0.5);
runTypeCase("6", "fighting", "normal", 2);
runTypeCase("7", "water", "fire", 2);
runTypeCase("8", "ghost", "normal", 0);
runTypeCase("9", "poison", "fairy", 2);
runTypeCase("10", "dark", "psychic", 2);

function runDualTypeCase(label, moveType, targetTypes, multiplier) {
  const moveId = `dual_type_case_${label}`;
  registerMove(moveId, {
    effects: [{ type: "damage", power: 60, accuracy: 1 }],
    type: moveType,
  });
  runCase(`DualType${label}: ${moveType} -> ${targetTypes.join("/")}`, () => {
    const state = createBattleState([
      {
        id: "p1",
        name: "A",
        team: makeCreature("Caster", [moveId], { types: ["typeless"] }),
      },
      {
        id: "p2",
        name: "B",
        team: makeCreature("Target", ["tackle"], { types: targetTypes }),
      },
    ]);
    const next = stepBattle(
      state,
      [{ playerId: "p1", moveId, targetId: "p2" }],
      makeRng([0, 1])
    );
    const expectedDamageValue =
      multiplier === 0
        ? 0
        : expectedDamageTyped(60, multiplier, 50, 50, 50, 1);
    const expected = Math.max(0, 100 - expectedDamageValue);
    assert.strictEqual(getActive(next, "p2").hp, expected);
  });
}

runDualTypeCase("1", "ice", ["dragon", "flying"], 4);
runDualTypeCase("2", "steel", ["fire", "water"], 0.25);
runDualTypeCase("3", "ground", ["electric", "flying"], 0);
runDualTypeCase("4", "electric", ["flying", "dragon"], 1);
runDualTypeCase("5", "poison", ["grass", "fairy"], 4);

// Ability11: merciless always crits vs poisoned targets
registerMove("merciless_strike", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
});
runCase("Ability11: merciless crit ignores defense boosts", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Mercy", ["merciless_strike"], {
        ability: "merciless",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  getActive(state, "p2").stages.def = 6;
  getActive(state, "p2").statuses.push({
    id: "poison",
    remainingTurns: null,
    data: {},
  });
  const rng = makeRng([0.5, 0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "merciless_strike", targetId: "p2" }],
    rng
  );
  const poisonTick = Math.floor(100 * 0.125);
  const expected =
    100 - expectedDamageCrit(60, 50, 50, 50, 1) - poisonTick;
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Ability12: super luck raises crit chance
registerMove("super_luck_strike", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
});
runCase("Ability12: super luck crits at 0.1 roll", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Lucky", ["super_luck_strike"], {
        ability: "super_luck",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  const rng = makeRng([0.5, 0, 0.1, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "super_luck_strike", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamageCrit(60, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Ability13: thick fat halves fire damage
registerMove("flame_burst", {
  effects: [{ type: "damage", power: 80, accuracy: 1 }],
  type: "fire",
});
runCase("Ability13: thick fat halves fire move power", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Caster", ["flame_burst"]),
    },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Chunky", ["tackle"], {
        ability: "thick_fat",
      }),
    },
  ]);
  const rng = makeRng([0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "flame_burst", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(80 * 0.5, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Ability14: fur coat doubles physical defense
registerMove("fur_coat_hit", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
});
runCase("Ability14: fur coat doubles defense vs physical", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["fur_coat_hit"]) },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Furry", ["tackle"], {
        ability: "fur_coat",
      }),
    },
  ]);
  const rng = makeRng([0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "fur_coat_hit", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(60, 50, 100, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Ability15: unaware ignores target defense boosts
registerMove("unaware_strike", {
  effects: [{ type: "damage", power: 60, accuracy: 1 }],
});
runCase("Ability15: unaware ignores defense stages", () => {
  const state = createBattleState([
    {
      id: "p1",
      name: "A",
      team: makeCreature("Unaware", ["unaware_strike"], {
        ability: "unaware",
      }),
    },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) },
  ]);
  getActive(state, "p2").stages.def = 6;
  const rng = makeRng([0, 1]);
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "unaware_strike", targetId: "p2" }],
    rng
  );
  const expected = 100 - expectedDamage(60, 50, 50, 50, 1);
  assert.strictEqual(getActive(next, "p2").hp, expected);
});

// Case 6: over_time damage
registerMove("curse_field", {
  effects: [
    {
      type: "over_time",
      duration: 3,
      timing: "turn_end",
      effects: [{ type: "damage_ratio", ratioMaxHp: 0.1 }],
    },
  ],
});
registerMove("wait", { effects: [] });
runCase("Case6: over_time applies 10% for 3 turns", () => {
  let state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["curse_field", "wait"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["wait"]) },
  ]);
  state = stepBattle(
    state,
    [{ playerId: "p1", moveId: "curse_field", targetId: "p2" }],
    makeRng([0])
  );
  state = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "wait", targetId: "p2" },
      { playerId: "p2", moveId: "wait", targetId: "p1" },
    ],
    makeRng([0])
  );
  state = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "wait", targetId: "p2" },
      { playerId: "p2", moveId: "wait", targetId: "p1" },
    ],
    makeRng([0])
  );
  state = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "wait", targetId: "p2" },
      { playerId: "p2", moveId: "wait", targetId: "p1" },
    ],
    makeRng([0])
  );
  assert.strictEqual(getActive(state, "p2").hp, 70);
});

// Case 7: delayed damage
registerMove("future_strike", {
  effects: [
    { type: "delay", afterTurns: 2, effects: [{ type: "damage", power: 100 }] },
  ],
});
runCase("Case7: delayed damage triggers after 2 turns", () => {
  let state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["future_strike", "wait"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["wait"]) },
  ]);
  state = stepBattle(
    state,
    [{ playerId: "p1", moveId: "future_strike", targetId: "p2" }],
    makeRng([0, 1])
  );
  state = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "wait", targetId: "p2" },
      { playerId: "p2", moveId: "wait", targetId: "p1" },
    ],
    makeRng([0, 1])
  );
  state = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "wait", targetId: "p2" },
      { playerId: "p2", moveId: "wait", targetId: "p1" },
    ],
    makeRng([1, 1])
  );
  const expectedHp = 100 - expectedDamage(100);
  assert.strictEqual(getActive(state, "p2").hp, expectedHp);
});

// Case 8: lock_move forces last move
registerMove("ember_test", { effects: [{ type: "damage", power: 40 }] });
runCase("Case8: lock_move forces last used move", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["tackle"]) },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Target", ["ember_test", "tackle"]),
    },
  ]);
  state.history = { turns: [] };
  state.history.turns.push({
    turn: 1,
    actions: [{ playerId: "p2", moveId: "tackle", targetId: "p1" }],
    rng: [],
    log: [],
  });
  getActive(state, "p2").statuses.push({
    id: "lock_move",
    remainingTurns: 3,
    data: { mode: "force_last_move" },
  });
  const next = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "tackle", targetId: "p2" },
      { playerId: "p2", moveId: "ember_test", targetId: "p1" },
    ],
    makeRng([0, 1, 1])
  );
  const lastAction = next.history.turns[next.history.turns.length - 1].actions.find(
    (a) => a.playerId === "p2"
  );
  assert.strictEqual(lastAction.moveId, "tackle");
});

// Case 9: disable_move blocks specific move
registerMove("fire_blast_disable", {
  effects: [{ type: "damage", power: 90 }],
});
runCase("Case9: disable_move prevents a move", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["tackle"]) },
    {
      id: "p2",
      name: "B",
      team: makeCreature("Target", ["fire_blast_disable"]),
    },
  ]);
  getActive(state, "p2").statuses.push({
    id: "disable_move",
    remainingTurns: 4,
    data: { moveId: "fire_blast_disable" },
  });
  const next = stepBattle(
    state,
    [
      { playerId: "p1", moveId: "tackle", targetId: "p2" },
      { playerId: "p2", moveId: "fire_blast_disable", targetId: "p1" },
    ],
    makeRng([0, 1, 1])
  );
  assert.strictEqual(getActive(next, "p1").hp, 100);
});

// Case 10: composite move
registerMove("chaos_wave", {
  effects: [
    { type: "damage", power: 80, accuracy: 1 },
    {
      type: "chance",
      p: 0.3,
      then: [{ type: "apply_status", statusId: "confusion", duration: 2 }],
    },
    {
      type: "conditional",
      if: { type: "target_hp_lt", value: 0.5 },
      then: [{ type: "modify_stage", target: "target", stages: { spe: -1 } }],
    },
  ],
});
runCase("Case10: chaos_wave damage + chance + conditional", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Caster", ["chaos_wave"]) },
    { id: "p2", name: "B", team: makeCreature("Target", ["wait"]) },
  ]);
  getActive(state, "p2").hp = 60;
  const rng = makeRng([0, 1, 0.2]); // hit, max damage, confusion proc
  const next = stepBattle(
    state,
    [{ playerId: "p1", moveId: "chaos_wave", targetId: "p2" }],
    rng
  );
  assert(hasStatus(next, "p2", "confusion"), "confusion should be applied");
  assert.strictEqual(getActive(next, "p2").stages.spe, -1);
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
