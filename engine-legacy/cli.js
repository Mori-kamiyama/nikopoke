const readline = require("readline");
const { createBattleState } = require("./core/state");
const { stepBattle, isBattleOver } = require("./core/battle");
const { getActiveCreature } = require("./core/utils");
const { moves } = require("./data/moves");

const creatures = {
  flameling: {
    id: "flameling",
    name: "Flameling",
    maxHp: 48,
    hp: 48,
    attack: 14,
    defense: 8,
    speed: 12,
    moves: ["ember", "tackle", "howl"],
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    statuses: [],
  },
  shellmon: {
    id: "shellmon",
    name: "Shellmon",
    maxHp: 55,
    hp: 55,
    attack: 12,
    defense: 10,
    speed: 9,
    moves: ["tackle", "slam"],
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    statuses: [],
  },
};

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let state = createBattleState([
    { id: "p1", name: "You", team: [creatures.flameling] },
    { id: "p2", name: "CPU", team: [creatures.shellmon] },
  ]);

  let lastLogIndex = 0;
  printStatus(state);

  while (!isBattleOver(state)) {
    const p1Active = getActiveCreature(state, "p1");
    const p2Active = getActiveCreature(state, "p2");

    const playerMove = await promptMove(rl, p1Active);
    const cpuMove = chooseCpuMove(p2Active);

    state = stepBattle(
      state,
      [
        { playerId: "p1", moveId: playerMove, targetId: "p2" },
        { playerId: "p2", moveId: cpuMove, targetId: "p1" },
      ],
      Math.random
    );

    printNewLogs(state, lastLogIndex);
    lastLogIndex = state.log.length;
    printStatus(state);
  }

  console.log(resultText(state));
  rl.close();
}

function promptMove(rl, creature) {
  return new Promise((resolve) => {
    const options = creature.moves
      .map((id, idx) => {
        const move = moves[id];
        return `${idx + 1}. ${move ? move.name : id}`;
      })
      .join("\n");
    rl.question(
      `\nChoose a move for ${creature.name}:\n${options}\n> `,
      (answer) => {
        const idx = Number(answer.trim()) - 1;
        const chosen = creature.moves[idx] ?? creature.moves[0];
        resolve(chosen);
      }
    );
  });
}

function chooseCpuMove(creature) {
  return creature.moves[Math.floor(Math.random() * creature.moves.length)];
}

function printStatus(state) {
  for (const player of state.players) {
    const c = getActiveCreature(state, player.id);
    const stages = `atk ${c.stages.atk} def ${c.stages.def} spe ${c.stages.spe}`;
    const statusText =
      c.statuses.length > 0
        ? c.statuses.map((s) => s.id).join(", ")
        : "none";
    console.log(
      `${player.name} - ${c.name}: HP ${c.hp}/${c.maxHp} | Atk ${c.attack} Def ${c.defense} Spd ${c.speed} | stages ${stages} | status ${statusText}`
    );
  }
}

function printNewLogs(state, fromIndex) {
  const newLogs = state.log.slice(fromIndex);
  for (const line of newLogs) {
    console.log(line);
  }
}

function resultText(state) {
  const winner = state.players.find((p) => getActiveCreature(state, p.id).hp > 0);
  const loser = state.players.find((p) => getActiveCreature(state, p.id).hp <= 0);
  if (!winner || !loser) return "Battle ended.";
  return `${winner.name}'s ${getActiveCreature(state, winner.id).name} wins! ${getActiveCreature(state, loser.id).name} fainted.`;
}

if (require.main === module) {
  main();
}
