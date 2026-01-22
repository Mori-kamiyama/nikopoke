#!/usr/bin/env node
/*
 * Meta search CLI
 * - Genetic search for strong single Pokemon (builds)
 * - Brute-force combos from top singles
 * - Win/loss/draw distribution per candidate vs meta nodes
 */

const os = require("os");
const path = require("path");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const { winRate, loadNodes, DEFAULT_NODES } = require("../ai_cli");
const { species } = require("../data/species");
const { learnsets } = require("../data/learnsets");

const DEFAULT_CONFIG = {
  populationSize: 50,
  generations: 20,
  eliteCount: 2,
  mutationRate: 0.4,
  battleIterations: 5,
  maxTurns: 20,
  depth: 1,
  threshold: 0.55,
  topSingles: 8,
  comboSize: 2,
  topCombos: 5,
  concurrency: os.cpus().length || 4,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--nodes":
        config.nodesPath = args[++i];
        break;
      case "--population":
        config.populationSize = Number(args[++i] ?? config.populationSize);
        break;
      case "--generations":
        config.generations = Number(args[++i] ?? config.generations);
        break;
      case "--elite":
        config.eliteCount = Number(args[++i] ?? config.eliteCount);
        break;
      case "--mutation":
        config.mutationRate = Number(args[++i] ?? config.mutationRate);
        break;
      case "--iterations":
        config.battleIterations = Number(args[++i] ?? config.battleIterations);
        break;
      case "--max-turns":
        config.maxTurns = Number(args[++i] ?? config.maxTurns);
        break;
      case "--depth":
        config.depth = Number(args[++i] ?? config.depth);
        break;
      case "--threshold":
        config.threshold = Number(args[++i] ?? config.threshold);
        break;
      case "--top":
        config.topSingles = Number(args[++i] ?? config.topSingles);
        break;
      case "--combo-size":
        config.comboSize = Number(args[++i] ?? config.comboSize);
        break;
      case "--top-combos":
        config.topCombos = Number(args[++i] ?? config.topCombos);
        break;
      case "--concurrency":
        config.concurrency = Number(args[++i] ?? config.concurrency);
        break;
      default:
        break;
    }
  }
  return config;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomMoves(speciesId, count = 4) {
  const allowed = learnsets[speciesId] || [];
  if (allowed.length === 0) return ["struggle"];
  const pool = [...allowed];
  const selected = [];
  while (selected.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    selected.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return selected;
}

function createRandomGenome() {
  const speciesList = Object.keys(learnsets);
  const speciesId = randomItem(speciesList);
  const spec = species[speciesId];
  const ability = spec.abilities ? randomItem(spec.abilities) : null;
  return {
    id: `g${Math.random().toString(36).slice(2)}`,
    slot: {
      species: speciesId,
      moves: getRandomMoves(speciesId),
      ability,
    },
    score: 0,
    results: [],
  };
}

function mutate(genome) {
  const next = structuredClone(genome);
  next.id = `m${Math.random().toString(36).slice(2)}`;

  if (Math.random() < 0.3) {
    const speciesList = Object.keys(learnsets);
    const speciesId = randomItem(speciesList);
    const spec = species[speciesId];
    next.slot.species = speciesId;
    next.slot.ability = spec.abilities ? randomItem(spec.abilities) : null;
    next.slot.moves = getRandomMoves(speciesId);
    return next;
  }

  if (Math.random() < 0.3) {
    const spec = species[next.slot.species];
    if (spec.abilities && spec.abilities.length > 0) {
      next.slot.ability = randomItem(spec.abilities);
    }
  }

  if (Math.random() < 0.6) {
    const allowed = learnsets[next.slot.species] || [];
    if (allowed.length > 0) {
      const slot = Math.floor(Math.random() * 4);
      let move = randomItem(allowed);
      let attempts = 0;
      while (next.slot.moves.includes(move) && attempts < 10) {
        move = randomItem(allowed);
        attempts += 1;
      }
      next.slot.moves[slot] = move;
    }
  }

  return next;
}

function crossover(p1, p2) {
  const parent = Math.random() < 0.5 ? p1 : p2;
  const other = parent === p1 ? p2 : p1;
  const child = {
    id: `c${Math.random().toString(36).slice(2)}`,
    slot: {
      species: parent.slot.species,
      ability: parent.slot.ability,
      moves: [],
    },
    score: 0,
    results: [],
  };

  const validMoves = new Set(learnsets[child.slot.species] || []);
  const pool = new Set();
  parent.slot.moves.forEach((m) => {
    if (validMoves.has(m)) pool.add(m);
  });
  other.slot.moves.forEach((m) => {
    if (validMoves.has(m)) pool.add(m);
  });
  if (pool.size < 4) {
    validMoves.forEach((m) => pool.add(m));
  }
  const poolArr = Array.from(pool);
  while (child.slot.moves.length < 4 && poolArr.length > 0) {
    const idx = Math.floor(Math.random() * poolArr.length);
    child.slot.moves.push(poolArr[idx]);
    poolArr.splice(idx, 1);
  }

  return child;
}

function nodeFromSlot(slot) {
  return {
    id: slot.species,
    team: [
      {
        species: slot.species,
        moves: slot.moves,
        ability: slot.ability,
      },
    ],
  };
}

function nodeFromSlots(slots, id) {
  return {
    id,
    team: slots.map((slot) => ({
      species: slot.species,
      moves: slot.moves,
      ability: slot.ability,
    })),
  };
}

function summarizeDistribution(results, threshold) {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const result of results) {
    if (result.winRate >= threshold) wins += 1;
    else if (result.winRate <= 1 - threshold) losses += 1;
    else draws += 1;
  }
  const total = results.length || 1;
  return {
    wins,
    losses,
    draws,
    winRate: wins / total,
    lossRate: losses / total,
    drawRate: draws / total,
  };
}

function evaluateSlot(slot, nodes, config) {
  const challenger = nodeFromSlot(slot);
  const results = [];
  let totalWinRate = 0;
  for (const metaNode of nodes) {
    const res = winRate(challenger, metaNode, {
      iterations: config.battleIterations,
      seed: `meta-${Math.random()}`,
      maxTurns: config.maxTurns,
      depth: config.depth,
      earlyStop: false,
      minIterations: Math.min(3, config.battleIterations),
    });
    results.push({ opponent: metaNode.id, winRate: res.a });
    totalWinRate += res.a;
  }
  const score = totalWinRate / nodes.length;
  return { score, results };
}

function evaluatePopulationParallel(population, nodes, config) {
  return new Promise((resolve) => {
    const workers = [];
    const resultsMap = new Map();
    const numWorkers = Math.min(config.concurrency, population.length);
    const chunkSize = Math.ceil(population.length / numWorkers);
    let completed = 0;

    for (let i = 0; i < numWorkers; i += 1) {
      const worker = new Worker(__filename, {
        workerData: {
          nodes,
          config,
        },
      });
      workers.push(worker);
      worker.on("message", (msg) => {
        if (msg.type !== "resultBatch") return;
        msg.results.forEach((res) => {
          resultsMap.set(res.id, res);
        });
        completed += msg.results.length;
        process.stdout.write(".".repeat(msg.results.length));
        if (completed === population.length) {
          process.stdout.write("\n");
          population.forEach((g) => {
            const res = resultsMap.get(g.id);
            if (res) {
              g.score = res.score;
              g.results = res.results;
            } else {
              g.score = 0;
              g.results = [];
            }
          });
          workers.forEach((w) => w.terminate());
          resolve();
        }
      });
    }

    workers.forEach((worker, idx) => {
      const slice = population.slice(idx * chunkSize, (idx + 1) * chunkSize);
      if (slice.length === 0) return;
      worker.postMessage({ type: "evaluateBatch", genomes: slice });
    });
  });
}

if (!isMainThread) {
  const { nodes, config } = workerData;
  parentPort.on("message", (task) => {
    if (task.type !== "evaluateBatch") return;
    const results = [];
    task.genomes.forEach((genome) => {
      try {
        const res = evaluateSlot(genome.slot, nodes, config);
        results.push({
          id: genome.id,
          score: res.score,
          results: res.results,
        });
      } catch (err) {
        results.push({
          id: genome.id,
          score: 0,
          results: [],
          error: err.message,
        });
      }
    });
    parentPort.postMessage({
      type: "resultBatch",
      results,
    });
  });
  return;
}

function printCandidate(genome, config) {
  const dist = summarizeDistribution(genome.results, config.threshold);
  console.log(`Species : ${genome.slot.species}`);
  console.log(`Ability : ${genome.slot.ability}`);
  console.log(`Moves   : ${genome.slot.moves.join(", ")}`);
  console.log(`Score   : ${(genome.score * 100).toFixed(1)}%`);
  console.log(
    `Nodes   : W ${dist.wins} / L ${dist.losses} / D ${dist.draws} (W ${(dist.winRate * 100).toFixed(1)}%)`
  );
}

function printCombo(combo, config) {
  const dist = summarizeDistribution(combo.results, config.threshold);
  console.log(`Combo   : ${combo.slots.map((s) => s.species).join(" + ")}`);
  console.log(`Score   : ${(combo.score * 100).toFixed(1)}%`);
  console.log(
    `Nodes   : W ${dist.wins} / L ${dist.losses} / D ${dist.draws} (W ${(dist.winRate * 100).toFixed(1)}%)`
  );
}

function buildCombos(slots, size) {
  const combos = [];
  function dfs(start, current) {
    if (current.length === size) {
      combos.push([...current]);
      return;
    }
    for (let i = start; i < slots.length; i += 1) {
      current.push(slots[i]);
      dfs(i + 1, current);
      current.pop();
    }
  }
  dfs(0, []);
  return combos;
}

async function main() {
  const config = parseArgs();
  const nodes = config.nodesPath ? loadNodes(config.nodesPath) : DEFAULT_NODES;

  console.log(
    `\nGenetic search: ${config.populationSize} x ${config.generations} (threads: ${config.concurrency})`
  );
  console.log(
    `Meta nodes: ${nodes.length} | iterations: ${config.battleIterations} | depth: ${config.depth}\n`
  );

  let population = [];
  for (let i = 0; i < config.populationSize; i += 1) {
    population.push(createRandomGenome());
  }

  for (let gen = 0; gen < config.generations; gen += 1) {
    process.stdout.write(`Generation ${String(gen + 1).padStart(2)}: `);
    await evaluatePopulationParallel(population, nodes, config);
    population.sort((a, b) => b.score - a.score);
    const best = population[0];
    console.log(
      ` -> Top: ${best.slot.species} (${(best.score * 100).toFixed(1)}%)`
    );

    const nextGen = population.slice(0, config.eliteCount);
    const poolSize = Math.max(2, Math.floor(config.populationSize / 2));
    const parentPool = population.slice(0, poolSize);
    while (nextGen.length < config.populationSize) {
      const p1 = randomItem(parentPool);
      const p2 = randomItem(parentPool);
      let child = crossover(p1, p2);
      if (Math.random() < config.mutationRate) {
        child = mutate(child);
      }
      nextGen.push(child);
    }
    population = nextGen;
  }

  population.sort((a, b) => b.score - a.score);
  const topSingles = population.slice(0, config.topSingles);

  console.log("\n=== Top Singles ===");
  topSingles.forEach((g, idx) => {
    console.log(`\n#${idx + 1}`);
    printCandidate(g, config);
  });

  if (config.comboSize > 1 && topSingles.length >= config.comboSize) {
    console.log(`\n=== Top Combos (size ${config.comboSize}) ===`);
    const combos = buildCombos(
      topSingles.map((g) => g.slot),
      config.comboSize
    );
    const scored = [];
    for (const slots of combos) {
      const node = nodeFromSlots(
        slots,
        slots.map((s) => s.species).join("+")
      );
      const results = [];
      let total = 0;
      for (const metaNode of nodes) {
        const res = winRate(node, metaNode, {
          iterations: config.battleIterations,
          seed: `combo-${Math.random()}`,
          maxTurns: config.maxTurns,
          depth: config.depth,
          earlyStop: false,
          minIterations: Math.min(3, config.battleIterations),
        });
        results.push({ opponent: metaNode.id, winRate: res.a });
        total += res.a;
      }
      scored.push({
        slots,
        score: total / nodes.length,
        results,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    scored.slice(0, config.topCombos).forEach((combo, idx) => {
      console.log(`\n#${idx + 1}`);
      printCombo(combo, config);
    });
  }
}

if (require.main === module) {
  main();
}
