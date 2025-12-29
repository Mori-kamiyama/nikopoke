const assert = require("assert");
const { createBattleState } = require("../core/state");
const { stepBattle } = require("../core/battle");
const { moves } = require("../data/moves");

// Helpers
function registerMove(id, def) {
  moves[id] = { id, name: id, ...def };
}

function makeCreature(name, moveIds, overrides = {}) {
  return [{
    id: name.toLowerCase(),
    name,
    level: 50,
    maxHp: 100,
    hp: 100,
    attack: 50,
    defense: 50,
    spAttack: 50,
    spDefense: 50,
    speed: 10,
    moves: moveIds,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    statuses: [],
    ...overrides,
  }];
}

function makeRng(sequence) {
  let i = 0;
  return () => {
    const v = sequence[i];
    i = Math.min(sequence.length - 1, i + 1);
    return v ?? 0;
  };
}

function getActive(state, playerId) {
    const p = state.players.find(x => x.id === playerId);
    return p.team[p.activeSlot];
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

// Tests for Refactored Abilities

// 1. Sharpness (Hooked)
registerMove("cut", {
  effects: [{ type: "damage", power: 50 }],
  tags: ["slicing"]
});
runCase("Hook: sharpness boosts slicing moves", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Cutter", ["cut"], { ability: "sharpness" }) },
    { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) }
  ]);
  const next = stepBattle(state, [{ playerId: "p1", moveId: "cut", targetId: "p2" }], makeRng([0, 1]));
  // Base 50 -> 75
  const expectedHp = 100 - Math.floor((((50 * 2) / 5 + 2) * 75 * 50 / 50 / 50 + 2)); 
  assert.strictEqual(getActive(next, "p2").hp, expectedHp);
});

// 2. Contrary (Hooked in Events)
registerMove("growl", {
  effects: [{ type: "modify_stage", target: "target", stages: { atk: -1 } }]
});
runCase("Hook: contrary inverts drops", () => {
  const state = createBattleState([
    { id: "p1", name: "A", team: makeCreature("Debuffer", ["growl"]) },
    { id: "p2", name: "B", team: makeCreature("Rebel", ["tackle"], { ability: "contrary" }) }
  ]);
  const next = stepBattle(state, [{ playerId: "p1", moveId: "growl", targetId: "p2" }], makeRng([0]));
  assert.strictEqual(getActive(next, "p2").stages.atk, 1);
});

// 3. Simple (Hooked in Events)
registerMove("sword_dance", {
    effects: [{ type: "modify_stage", target: "self", stages: { atk: 2 } }]
});
runCase("Hook: simple doubles boosts", () => {
    const state = createBattleState([
        { id: "p1", name: "A", team: makeCreature("Simpleton", ["sword_dance"], { ability: "simple" }) },
        { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) }
    ]);
    const next = stepBattle(state, [{ playerId: "p1", moveId: "sword_dance", targetId: "p2" }], makeRng([0]));
    assert.strictEqual(getActive(next, "p1").stages.atk, 4);
});

// 4. Immunity (Hooked in Events)
registerMove("toxic", {
    effects: [{ type: "apply_status", statusId: "poison", target: "target" }]
});
runCase("Hook: immunity blocks poison", () => {
    const state = createBattleState([
        { id: "p1", name: "A", team: makeCreature("ToxicUser", ["toxic"]) },
        { id: "p2", name: "B", team: makeCreature("Immune", ["tackle"], { ability: "immunity" }) }
    ]);
    const next = stepBattle(state, [{ playerId: "p1", moveId: "toxic", targetId: "p2" }], makeRng([0]));
    const target = getActive(next, "p2");
    assert.ok(!target.statuses.some(s => s.id === "poison"));
});

// 5. Libero (Hooked in Battle)
registerMove("ember", { type: "fire", effects: [{ type: "damage", power: 40 }] });
runCase("Hook: libero changes type before move", () => {
    const state = createBattleState([
        { id: "p1", name: "A", team: makeCreature("Ace", ["ember"], { ability: "libero", types: ["normal"] }) },
        { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) }
    ]);
    const next = stepBattle(state, [{ playerId: "p1", moveId: "ember", targetId: "p2" }], makeRng([0, 1]));
    assert.deepStrictEqual(getActive(next, "p1").types, ["fire"]);
    // And verify STAB applied? (Not easily checked here without math, but type change is key)
});

// 6. Prankster (Hooked in Battle)
registerMove("prio_status", { category: "status", priority: 0, effects: [{ type: "modify_stage", target: "self", stages: { def: 1 } }] });
registerMove("quick_attack", { priority: 1, effects: [{ type: "damage", power: 40 }] });
runCase("Hook: prankster gives +1 priority to status", () => {
    const state = createBattleState([
        { id: "p1", name: "A", team: makeCreature("Prank", ["prio_status"], { ability: "prankster", speed: 10 }) },
        { id: "p2", name: "B", team: makeCreature("Fast", ["quick_attack"], { speed: 100 }) }
    ]);
    // Quick Attack is prio 1. Prankster Status becomes prio 1.
    // Speed tie breaker? 
    // Wait, getActionPriority logic: base + 1. 0 + 1 = 1.
    // Quick Attack is 1.
    // Priority tie breaker: random? 
    // Core battle logic: sort by priority desc, then speed desc.
    // Fast (p2) is faster (100 vs 10). So P2 goes first if priorities are equal.
    // Let's make P2 use a normal move (prio 0) but be faster.
    // If Prankster works, P1 goes first.
    
    registerMove("tackle_fast", { priority: 0, effects: [{ type: "damage", power: 40 }] });
    
    const state2 = createBattleState([
        { id: "p1", name: "A", team: makeCreature("Prank", ["prio_status"], { ability: "prankster", speed: 10 }) },
        { id: "p2", name: "B", team: makeCreature("Fast", ["tackle_fast"], { speed: 100 }) }
    ]);
    
    const next = stepBattle(state2, [
        { playerId: "p1", moveId: "prio_status", targetId: "p1" },
        { playerId: "p2", moveId: "tackle_fast", targetId: "p1" }
    ], makeRng([0, 0])); // Rng for speed tie is irrelevant if priorities differ
    
    const firstAction = next.history.turns[0].actions[0];
    assert.strictEqual(firstAction.playerId, "p1", "Prankster should move first");
});

// 7. Slow Start (Hooked Offense/Speed)
registerMove("slam", { category: "physical", effects: [{ type: "damage", power: 80 }] });
runCase("Hook: slow start halves attack and speed", () => {
    const state = createBattleState([
        { id: "p1", name: "A", team: makeCreature("Slow", ["slam"], { ability: "slow_start", speed: 20 }) },
        { id: "p2", name: "B", team: makeCreature("Fast", ["tackle"], { speed: 15 }) }
    ]);
    // Turn 1
    const next = stepBattle(state, [
        { playerId: "p1", moveId: "slam", targetId: "p2" },
        { playerId: "p2", moveId: "tackle", targetId: "p1" }
    ], makeRng([0, 1]));
    
    // Check speed order: P1 speed 20 -> 10. P2 speed 15. P2 should go first.
    const firstAction = next.history.turns[0].actions[0];
    assert.strictEqual(firstAction.playerId, "p2", "Slow Start should be slower");
    
    // Check damage: P1 atk 50 -> 25.
    // Expected damage with Atk 25 vs Def 50.
    const expected = 100 - Math.floor((((50 * 2) / 5 + 2) * 80 * 25 / 50 / 50 + 2));
    assert.strictEqual(getActive(next, "p2").hp, expected, "Damage should be halved");
});

// 8. Merciless (Hooked Crit)
registerMove("sludge_bomb", { effects: [{ type: "damage", power: 90 }] });
runCase("Hook: merciless ensures crit on poisoned", () => {
    const state = createBattleState([
        { id: "p1", name: "A", team: makeCreature("Mercy", ["sludge_bomb"], { ability: "merciless" }) },
        { id: "p2", name: "B", team: makeCreature("Target", ["tackle"]) }
    ]);
    getActive(state, "p2").statuses.push({ id: "poison", remainingTurns: null });
    
    const next = stepBattle(state, [{ playerId: "p1", moveId: "sludge_bomb", targetId: "p2" }], makeRng([0.9, 1])); 
    // RNG 0.9 would normally fail crit (default 1/24 or 1/16).
    
    // Calculate expected crit damage
    const expected = 100 - Math.floor(((((50 * 2) / 5 + 2) * 90 * 50 / 50 / 50 + 2) * 1 * 1.5)) - Math.floor(100/8); // poison tick
    assert.strictEqual(getActive(next, "p2").hp, expected);
});

// 9. Receiver / Power of Alchemy (Switch-in)
registerMove("heavy_hit", { effects: [{ type: "damage", power: 200 }] });
runCase("Hook: receiver copies fainted ally ability on switch in", () => {
    const state = createBattleState([
        {
            id: "p1",
            name: "A",
            team: [
                ...makeCreature("Faints", ["tackle"], { ability: "technician", hp: 1, maxHp: 1 }),
                ...makeCreature("Receiver", ["tackle"], { ability: "receiver" })
            ],
        },
        {
            id: "p2",
            name: "B",
            team: makeCreature("Attacker", ["heavy_hit"], { attack: 200 })
        }
    ]);

    const afterKo = stepBattle(
        state,
        [{ playerId: "p2", moveId: "heavy_hit", targetId: "p1" }],
        makeRng([0, 1])
    );

    const afterSwitch = stepBattle(
        afterKo,
        [{ playerId: "p1", type: "switch", slot: 1 }],
        makeRng([0])
    );

    assert.strictEqual(getActive(afterSwitch, "p1").ability, "technician");
});

// 10. Shadow Tag (Trap)
runCase("Hook: shadow_tag prevents switching", () => {
    const state = createBattleState([
        { id: "p1", name: "A", team: makeCreature("Trapper", ["tackle"], { ability: "shadow_tag" }) },
        {
            id: "p2",
            name: "B",
            team: [
                ...makeCreature("Stuck", ["tackle"]),
                ...makeCreature("Bench", ["tackle"])
            ],
        }
    ]);

    const next = stepBattle(
        state,
        [{ playerId: "p2", type: "switch", slot: 1 }],
        makeRng([0])
    );

    assert.strictEqual(next.players.find((p) => p.id === "p2").activeSlot, 0);
});

if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
}
