const { createBattleState } = require("./core/state");
const { runAutoBattle } = require("./ai/simple");
const { replayBattle } = require("./core/replay");

const creatures = {
  flameling: {
    id: "flameling",
    name: "Flameling",
    maxHp: 48,
    attack: 14,
    defense: 8,
    speed: 12,
    moves: ["ember", "tackle", "howl"],
  },
  shellmon: {
    id: "shellmon",
    name: "Shellmon",
    maxHp: 55,
    attack: 12,
    defense: 10,
    speed: 9,
    moves: ["tackle", "slam"],
  },
};

function main() {
  const initial = createBattleState([
    { id: "p1", name: "AI-1", creature: creatures.flameling },
    { id: "p2", name: "AI-2", creature: creatures.shellmon },
  ]);

  const final = runAutoBattle(initial, Math.random);
  console.log(final.log.join("\n"));
  const winner = final.players.find((p) => p.active.hp > 0);
  if (winner) {
    console.log(`Winner: ${winner.name} (${winner.active.name})`);
  }

  // Replay using recorded history to verify determinism.
  const replayInitial = createBattleState([
    { id: "p1", name: "AI-1", creature: creatures.flameling },
    { id: "p2", name: "AI-2", creature: creatures.shellmon },
  ]);
  const replayed = replayBattle(replayInitial, final.history);
  const replayWinner = replayed.players.find((p) => p.active.hp > 0);
  if (replayWinner) {
    console.log(
      `Replay winner: ${replayWinner.name} (${replayWinner.active.name})`
    );
  }
}

if (require.main === module) {
  main();
}
