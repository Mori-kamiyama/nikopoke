const assert = require("assert");
const { stepBattle } = require("../core/battle");
const { createCreature } = require("../core/factory");
const { species } = require("../data/species");

function createBattleState(p1Team, p2Team) {
  return {
    turn: 0,
    field: { global: [] },
    players: [
      { id: "p1", name: "Player 1", activeSlot: 0, team: p1Team },
      { id: "p2", name: "Player 2", activeSlot: 0, team: p2Team },
    ],
    log: [],
  };
}

function makeRng(sequence) {
  let i = 0;
  return () => {
    const v = sequence[i];
    i = Math.min(sequence.length - 1, i + 1);
    return v ?? 0;
  };
}

// 1. Icicle Spear Test (Multi-hit)
{
  console.log("Testing Icicle Spear...");
  // P1: Skill Link? No, test normal first.
  const p1 = createCreature(species.tatuta, { moves: ["icicle_spear"] });
  const p2 = createCreature(species.morimitu, { moves: ["tackle"] });
  p2.hp = 500; p2.maxHp = 500;

  let state = createBattleState([p1], [p2]);

  // Turn 1: Icicle Spear. Min 2, Max 5. Range 4.
  // RNG: 0.9 (Effect Count -> 2 + floor(0.9*4) = 2+3=5 hits)
  // Hits: 5 times.
  // RNG Sequence:
  // 1. Sort
  // 2. Sort
  // 3. Repeat Count (0.9) -> 5
  // 4. Hit 1 (Accuracy 1.0) -> Pass
  // 5. Crit 1 -> Fail
  // 6. Dmg 1
  // ... Repeat for 5 hits
  
  // Just test count logic.
  // We need enough RNG for 5 hits: (Hit, Crit, Dmg) * 5 = 15 calls.
  // + 1 call for count.
  const rngSeq = [0.1, 0.1, 0.9]; // Sorts, Count=5
  for(let k=0; k<15; k++) rngSeq.push(0.5); 
  
  state = stepBattle(state, [
      { type: "move", playerId: "p1", moveId: "icicle_spear" },
      { type: "move", playerId: "p2", moveId: "tackle" }
  ], makeRng(rngSeq));

  const hitLog = state.log.find(l => l.includes("Hit 5 time(s)!"));
  assert.ok(hitLog, "Should hit 5 times");
  console.log("Icicle Spear (Normal) passed!");
}

// 2. Skill Link Test
{
  console.log("Testing Skill Link...");
  const p1 = createCreature(species.tatuta, { moves: ["icicle_spear"], ability: "skill_link" }); // Tatuta has no native skill_link, but overrides should work
  const p2 = createCreature(species.morimitu, { moves: ["tackle"] });
  console.log("P1 Ability:", p1.ability);
  
  let state = createBattleState([p1], [p2]);
  
  // RNG for count: 0.0 (Should be 2 normally).
  // But Skill Link should force Max (5).
  const rngSeq = [0.1, 0.1, 0.0]; // Count RNG = 0.0
  for(let k=0; k<15; k++) rngSeq.push(0.5); 
  
  state = stepBattle(state, [
      { type: "move", playerId: "p1", moveId: "icicle_spear" },
      { type: "move", playerId: "p2", moveId: "tackle" }
  ], makeRng(rngSeq));

  const hitLog = state.log.find(l => l.includes("Hit 5 time(s)!"));
  if (!hitLog) {
      console.log("Logs:", state.log);
  }
  assert.ok(hitLog, "Skill Link should force 5 hits");
  console.log("Skill Link passed!");
}

// 3. Solar Beam Test (Two-turn)
{
  console.log("Testing Solar Beam...");
  const p1 = createCreature(species.tatuta, { moves: ["solar_beam"] });
  const p2 = createCreature(species.morimitu, { moves: ["tackle"] });
  p2.hp = 500; p2.maxHp = 500;

  let state = createBattleState([p1], [p2]);

  // Turn 1: Charge
  state = stepBattle(state, [
      { type: "move", playerId: "p1", moveId: "solar_beam" },
      { type: "move", playerId: "p2", moveId: "tackle" }
  ], makeRng([0.1, 0.1]));

  const chargeLog = state.log.find(l => l.includes("absorbed light!"));
  assert.ok(chargeLog, "Should absorb light on turn 1");
  const damageLog = state.log.find(l => l.includes("used Solar Beam!")); // "used Solar Beam" logs at start of move processing.
  // Wait, damage shouldn't happen.
  const tookDamage = state.log.find(l => l.includes("took") && l.includes("damage"));
  // Tackle does damage. Need to distinguish.
  const morimituDamage = state.log.find(l => l.includes("もりみつ took"));
  assert.ok(!morimituDamage, "Target should NOT take damage on turn 1");
  
  assert.ok(state.players[0].team[0].statuses.some(s => s.id === "charging_solar_beam"), "Should have charging status");

  // Turn 2: Fire (Auto-select?)
  // We can input 'tackle' for P1, but status should override it to 'solar_beam'.
  state = stepBattle(state, [
      { type: "move", playerId: "p1", moveId: "tackle" }, // Try to switch move
      { type: "move", playerId: "p2", moveId: "tackle" }
  ], makeRng([0.1, 0.1, 0.5, 0.9, 1.0])); // Hit check for Solar Beam

  const fireLog = state.log.slice(-5).find(l => l.includes("used Solar Beam"));
  assert.ok(fireLog, "Should automatically use Solar Beam on turn 2");
  
  const morimituDamage2 = state.log.find(l => l.includes("もりみつ took"));
  assert.ok(morimituDamage2, "Target SHOULD take damage on turn 2");
  
  assert.ok(!state.players[0].team[0].statuses.some(s => s.id === "charging_solar_beam"), "Charging status should be removed");
  console.log("Solar Beam passed!");
}

// 4. Belch requires berry consumption
{
  console.log("Testing Belch gate...");
  const p1 = createCreature(species.ikkun, { moves: ["belch"], item: "sitrus_berry" });
  const p2 = createCreature(species.morimitu, { moves: ["tackle"] });
  p2.hp = p2.maxHp = 200;

  let state = createBattleState([p1], [p2]);

  // Turn 1: Belch should fail without berry consumption
  state = stepBattle(state, [
    { type: "move", playerId: "p1", moveId: "belch" },
  ], makeRng([0.1, 0.5]));
  assert.strictEqual(state.players[1].team[0].hp, 200, "Belch should fail without consuming a berry");

  // Turn 2: Consume the berry
  state = stepBattle(state, [
    { type: "use_item", playerId: "p1" },
  ], makeRng([0.1]));
  const belchUser = state.players[0].team[0];
  assert.ok(belchUser.statuses.some((s) => s.id === "berry_consumed"), "Berry should be marked as consumed");

  // Turn 3: Belch should now hit
  state = stepBattle(state, [
    { type: "move", playerId: "p1", moveId: "belch" },
  ], makeRng([0.1, 0.1, 0.99, 0.5]));
  assert.ok(state.players[1].team[0].hp < 200, "Belch should deal damage after berry consumption");
  console.log("Belch gate passed!");
}

// 5. Poltergeist requires target item
{
  console.log("Testing Poltergeist item gate...");
  const p1 = createCreature(species.ume, { moves: ["poltergeist"] });
  const p2 = createCreature(species.tatuta, { moves: ["tackle"] });
  p2.hp = p2.maxHp = 200;

  let state = createBattleState([p1], [p2]);

  // Turn 1: No item on target -> should fail
  state = stepBattle(state, [
    { type: "move", playerId: "p1", moveId: "poltergeist" },
  ], makeRng([0.1]));
  const hpAfterNoItem = state.players[1].team[0].hp;
  assert.strictEqual(hpAfterNoItem, 200, "Poltergeist should fail when the target has no item");

  // Give target an item
  state.players[1].team[0].item = "leftovers";

  // Turn 2: With item -> should hit
  state = stepBattle(state, [
    { type: "move", playerId: "p1", moveId: "poltergeist" },
  ], makeRng([0.1, 0.1, 0.99, 0.5]));
  assert.ok(state.players[1].team[0].hp < hpAfterNoItem, "Poltergeist should deal damage when target holds an item");
  console.log("Poltergeist item gate passed!");
}

// 6. Knock Off removes held items
{
  console.log("Testing Knock Off removal...");
  const p1 = createCreature(species.ayuma, { moves: ["knock_off"] });
  const p2 = createCreature(species.morimitu, { moves: ["tackle"], item: "leftovers" });
  p2.hp = p2.maxHp = 200;

  let state = createBattleState([p1], [p2]);

  state = stepBattle(state, [
    { type: "move", playerId: "p1", moveId: "knock_off" },
  ], makeRng([0.1, 0.1, 0.99, 0.5]));

  const target = state.players[1].team[0];
  assert.ok(target.hp < 200, "Knock Off should deal damage");
  assert.strictEqual(target.item, null, "Knock Off should remove the target's item");
  console.log("Knock Off removal passed!");
}
