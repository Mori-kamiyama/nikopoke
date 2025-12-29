#!/usr/bin/env node
/**
 * Meta AI CLI
 * - Computes win-rate matrix between configurations (nodes)
 * - Builds a dominance graph from a win-rate threshold
 * - Scores meta health via SCC size, dominance, and win-rate spread
 *
 * This CLI does not learn; it simulates with a shallow minimax agent and reports structure.
 */

const fs = require("fs");
const path = require("path");
const { createBattleState } = require("./core/state");
const { stepBattle, isBattleOver } = require("./core/battle");
const { createCreature } = require("./core/factory");
const { getActiveCreature } = require("./core/utils");
const { species } = require("./data/species");

const DEFAULT_NODES = [
  {
    id: "bulky-water",
    team: [
      {
        species: "eiraku",
        moves: ["waterfall", "aqua_jet", "bulk_up", "protect"],
        ability: "immunity",
      },
    ],
  },
  {
    id: "shell-breaker",
    team: [
      {
        species: "machida",
        moves: ["shell_smash", "waterfall", "earthquake", "quick_turn"],
        ability: "stamina",
      },
    ],
  },
  {
    id: "dragon-dancer",
    team: [
      {
        species: "tatuta",
        moves: ["dragon_dance", "wood_hammer", "flare_song", "protect"],
        ability: "chlorophyll",
      },
    ],
  },
];

const DEFAULT_OPTIONS = {
  iterations: 25,
  threshold: 0.9,
  seed: "meta",
  maxTurns: 50,
  depth: 1,
  earlyStop: false,
  minIterations: 5,
  assumeSymmetry: false,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--nodes":
        options.nodesPath = args[++i];
        break;
      case "--iterations":
      case "-n":
        options.iterations = Number(args[++i] ?? options.iterations);
        break;
      case "--threshold":
      case "-t":
        options.threshold = Number(args[++i] ?? options.threshold);
        break;
      case "--seed":
        options.seed = String(args[++i] ?? options.seed);
        break;
      case "--max-turns":
        options.maxTurns = Number(args[++i] ?? options.maxTurns);
        break;
      case "--depth":
        options.depth = Number(args[++i] ?? options.depth);
        break;
      case "--early-stop":
        options.earlyStop = true;
        break;
      case "--min-iterations":
        options.minIterations = Number(args[++i] ?? options.minIterations);
        break;
      case "--assume-symmetric":
        options.assumeSymmetry = true;
        break;
      default:
        break;
    }
  }
  return options;
}

function loadNodes(nodesPath) {
  if (!nodesPath) return DEFAULT_NODES;
  const resolved = path.resolve(nodesPath);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Nodes file must be an array of configurations");
  }
  return parsed;
}

function instantiateTeam(teamDef) {
  return teamDef.map((slot, idx) => {
    const spec = species[slot.species];
    if (!spec) {
      throw new Error(`Unknown species '${slot.species}' in slot ${idx}`);
    }
    return createCreature(spec, {
      moves: (slot.moves || []).slice(0, 4),
      ability: slot.ability ?? spec.abilities?.[0],
      item: slot.item ?? null,
      name: slot.name ?? spec.name,
    });
  });
}

function buildPlayers(nodes) {
  return nodes.map((node, idx) => ({
    id: `p${idx + 1}`,
    name: node.id,
    team: instantiateTeam(node.team ?? [node]),
  }));
}

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const t = (h ^= h >>> 16) >>> 0;
    return (t & 0xfffffff) / 0x10000000;
  };
}

function listActions(state, playerId) {
  const creature = getActiveCreature(state, playerId);
  if (!creature || creature.hp <= 0) return [];
  const targetId = state.players.find((p) => p.id !== playerId)?.id;
  if (!targetId) return [];
  return (creature.moves || []).map((moveId) => ({
    playerId,
    moveId,
    targetId,
  }));
}

function scoreState(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  const opp = state.players.find((p) => p.id !== playerId);
  const myHp = sumHpRatio(me);
  const oppHp = sumHpRatio(opp);
  return myHp - oppHp;
}

function sumHpRatio(player) {
  if (!player) return 0;
  return (player.team || []).reduce(
    (acc, c) => acc + (c.maxHp ? c.hp / c.maxHp : 0),
    0
  );
}

function chooseMinimaxAction(state, playerId, seedBase, depth = 1) {
  const myActions = listActions(state, playerId);
  if (myActions.length === 0) return null;
  const oppId = state.players.find((p) => p.id !== playerId)?.id;
  const oppActions = oppId ? listActions(state, oppId) : [];

  let best = { action: myActions[0], score: -Infinity };
  for (let i = 0; i < myActions.length; i += 1) {
    const myAction = myActions[i];
    let worstCase = Infinity;
    const oppCount = Math.max(oppActions.length, 1);
    for (let j = 0; j < oppCount; j += 1) {
      const oppAction = oppActions[j];
      const rng = hashSeed(`${seedBase}|${playerId}|${i}|${j}|d${depth}`);
      const simState = structuredClone(state);
      const actions = oppAction ? [myAction, oppAction] : [myAction];
      const after = stepBattle(simState, actions, rng, { recordHistory: false });
      const score = scoreState(after, playerId);
      worstCase = Math.min(worstCase, score);
      if (worstCase <= best.score) break;
    }
    if (worstCase > best.score) {
      best = { action: myAction, score: worstCase };
    }
  }
  return best.action;
}

function runMinimaxBattle(nodeA, nodeB, opts, seedSuffix = "") {
  const players = buildPlayers([nodeA, nodeB]);
  let state = createBattleState(players);
  const rng = hashSeed(`${opts.seed}|${seedSuffix}`);

  let turns = 0;
  while (!isBattleOver(state) && turns < opts.maxTurns) {
    turns += 1;
    const seedBase = `${seedSuffix}|turn${turns}`;
    const actions = [];
    for (const player of state.players) {
      const action = chooseMinimaxAction(
        state,
        player.id,
        `${opts.seed}|${seedBase}`,
        opts.depth
      );
      if (action) actions.push(action);
    }
    if (actions.length === 0) break;
    state = stepBattle(state, actions, rng, { recordHistory: false });
  }
  return state;
}

function pickWinner(state) {
  const [p1, p2] = state.players;
  const hp1 = sumHpRatio(p1);
  const hp2 = sumHpRatio(p2);
  if (hp1 > hp2) return p1.id;
  if (hp2 > hp1) return p2.id;
  return null;
}

function winRate(nodeA, nodeB, opts) {
  let winsA = 0;
  let winsB = 0;
  const total = opts.iterations;
  const minIterations = Math.min(opts.minIterations, total);
  for (let i = 0; i < total; i += 1) {
    const final = runMinimaxBattle(nodeA, nodeB, opts, `match${i}`);
    const winner = pickWinner(final);
    if (winner === "p1") winsA += 1;
    else if (winner === "p2") winsB += 1;
    else {
      winsA += 0.5;
      winsB += 0.5;
    }
    if (opts.earlyStop && i + 1 >= minIterations) {
      const played = i + 1;
      const remaining = total - played;
      const lead = Math.abs(winsA - winsB);
      if (lead > remaining) {
        return {
          a: winsA / played,
          b: winsB / played,
        };
      }
    }
  }
  return {
    a: winsA / total,
    b: winsB / total,
  };
}

function buildWinMatrix(nodes, opts) {
  const matrix = Array.from({ length: nodes.length }, () =>
    Array(nodes.length).fill(0.5)
  );
  if (opts.assumeSymmetry) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i; j < nodes.length; j += 1) {
        if (i === j) {
          matrix[i][j] = 0.5;
          continue;
        }
        const { a } = winRate(nodes[i], nodes[j], opts);
        const rateA = Number(a.toFixed(3));
        const rateB = Number((1 - a).toFixed(3));
        matrix[i][j] = rateA;
        matrix[j][i] = rateB;
      }
    }
  } else {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = 0; j < nodes.length; j += 1) {
        if (i === j) {
          matrix[i][j] = 0.5;
          continue;
        }
        const { a } = winRate(nodes[i], nodes[j], opts);
        matrix[i][j] = Number(a.toFixed(3));
      }
    }
  }
  return matrix;
}

function buildDominanceGraph(nodes, matrix, threshold) {
  const edges = new Map();
  nodes.forEach((_, idx) => edges.set(idx, []));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) continue;
      if (matrix[i][j] >= threshold) {
        edges.get(i).push(j);
      }
    }
  }
  return edges;
}

function tarjans(nodes, edges) {
  const ids = new Array(nodes.length).fill(0);
  const low = new Array(nodes.length).fill(0);
  const onStack = new Array(nodes.length).fill(false);
  const stack = [];
  const sccs = [];
  let idCounter = 1;

  function dfs(at) {
    stack.push(at);
    onStack[at] = true;
    ids[at] = low[at] = idCounter++;

    for (const to of edges.get(at) ?? []) {
      if (ids[to] === 0) dfs(to);
      if (onStack[to]) low[at] = Math.min(low[at], low[to]);
    }

    if (ids[at] === low[at]) {
      const comp = [];
      while (true) {
        const node = stack.pop();
        onStack[node] = false;
        comp.push(node);
        if (node === at) break;
      }
      sccs.push(comp);
    }
  }

  for (let i = 0; i < nodes.length; i += 1) {
    if (ids[i] === 0) dfs(i);
  }
  return sccs;
}

function metaScore(nodes, matrix, edges) {
  const outDegrees = nodes.map((_, idx) => edges.get(idx)?.length ?? 0);
  const maxOut = Math.max(...outDegrees, 0);
  const normMaxOut = nodes.length > 1 ? maxOut / (nodes.length - 1) : 0;

  const values = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) continue;
      values.push(matrix[i][j]);
    }
  }
  const mean = values.reduce((a, v) => a + v, 0) / (values.length || 1);
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length || 1);
  const spread = Math.sqrt(variance);

  const sccs = tarjans(nodes, edges);
  const avgSccSize =
    sccs.reduce((a, comp) => a + comp.length, 0) / (sccs.length || 1);

  const score = Number((avgSccSize - normMaxOut - spread).toFixed(3));
  return { score, avgSccSize, normMaxOut, spread, sccs, outDegrees };
}

function printMatrix(nodes, matrix) {
  const header = [" ".repeat(12), ...nodes.map((n) => pad(n.id, 10))].join(" ");
  console.log(header);
  for (let i = 0; i < nodes.length; i += 1) {
    const row = [pad(nodes[i].id, 12)];
    for (let j = 0; j < nodes.length; j += 1) {
      row.push(pad(matrix[i][j].toFixed(3), 10));
    }
    console.log(row.join(" "));
  }
}

function pad(str, len) {
  const s = String(str);
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

function printGraph(nodes, edges, threshold) {
  console.log(`\nDominance edges (>= ${threshold}):`);
  let count = 0;
  for (const [from, tos] of edges.entries()) {
    if (!tos.length) continue;
    for (const to of tos) {
      console.log(`  ${nodes[from].id} -> ${nodes[to].id}`);
      count += 1;
    }
  }
  if (count === 0) console.log("  (none)");
}

function main() {
  try {
    const opts = parseArgs();
    const nodes = loadNodes(opts.nodesPath);
    console.log(
      `Running Meta AI with ${nodes.length} nodes, ${opts.iterations} matches/pair`
    );
    const matrix = buildWinMatrix(nodes, opts);
    printMatrix(nodes, matrix);
    const edges = buildDominanceGraph(nodes, matrix, opts.threshold);
    printGraph(nodes, edges, opts.threshold);
    const meta = metaScore(nodes, matrix, edges);
    console.log("\nMeta health:");
    console.log(`  MetaScore: ${meta.score}`);
    console.log(`  Avg SCC size: ${meta.avgSccSize.toFixed(2)}`);
    console.log(`  Normalized max out-degree: ${meta.normMaxOut.toFixed(2)}`);
    console.log(`  Win-rate spread (stddev): ${meta.spread.toFixed(3)}`);
    console.log("  Strongly connected components:");
    meta.sccs.forEach((comp, idx) => {
      const names = comp.map((i) => nodes[i].id).join(", ");
      console.log(`    ${idx + 1}. ${names}`);
    });
    const dominant = nodes
      .map((n, idx) => ({ node: n.id, out: meta.outDegrees[idx] }))
      .filter((d) => d.out > 0)
      .sort((a, b) => b.out - a.out);
    if (dominant.length) {
      console.log("  Out-degree ranking:");
      dominant.forEach((d) =>
        console.log(`    ${d.node}: ${d.out} edges >= threshold`)
      );
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_NODES,
  runMinimaxBattle,
  winRate,
  buildPlayers,
  instantiateTeam,
  loadNodes,
  main,
};

if (require.main === module) {
  main();
}
