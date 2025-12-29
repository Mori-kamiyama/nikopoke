const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------
const CONFIG = {
  populationSize: 50,      // Increased population
  generations: 20,
  eliteCount: 2,
  mutationRate: 0.4,
  battleIterations: 5,     // More reliable results
  maxTurns: 20,            // Shorter battles for speed
  concurrency: os.cpus().length || 4
};

// ----------------------------------------------------------------------------
// Worker Thread Logic
// ----------------------------------------------------------------------------
if (!isMainThread) {
  const { winRate, DEFAULT_NODES } = require('./ai_cli');

  parentPort.on('message', (task) => {
    try {
      if (task.type === 'evaluate') {
        const { genome } = task;
        
        const challengerNode = {
          id: "challenger",
          team: [{
            species: genome.species,
            moves: genome.moves,
            ability: genome.ability
          }]
        };

        const results = [];
        let totalWinRate = 0;

        for (const metaNode of DEFAULT_NODES) {
          const res = winRate(challengerNode, metaNode, {
            iterations: CONFIG.battleIterations,
            seed: `gen-${Math.random()}`,
            maxTurns: CONFIG.maxTurns,
            depth: 1
          });
          
          results.push({
            opponent: metaNode.id,
            winRate: res.a
          });
          totalWinRate += res.a;
        }

        const score = totalWinRate / DEFAULT_NODES.length;
        parentPort.postMessage({ type: 'result', score, results, id: genome.id });
      }
    } catch (err) {
      // In case of error (e.g. invalid moves generated), return 0 score
      // console.error(err.message);
      parentPort.postMessage({ type: 'result', score: 0, results: [], id: task.genome.id, error: err.message });
    }
  });

  return;
}

// ----------------------------------------------------------------------------
// Main Thread Logic
// ----------------------------------------------------------------------------
const { species } = require("./data/species");
const { learnsets } = require("./data/learnsets");

// --- Helper Functions ---

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

function getRandomMoves(speciesId, count = 4) {
  const allowed = learnsets[speciesId] || [];
  if (allowed.length === 0) return ["struggle"];
  const selected = [];
  // Allow duplicates or ensure unique? Usually unique is better, but code allowed duplicates before.
  // Let's ensure unique if possible.
  const pool = [...allowed];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) break;
    const idx = Math.floor(Math.random() * pool.length);
    selected.push(pool[idx]);
    pool.splice(idx, 1); // remove selected
  }
  return selected;
}

function createRandomGenome() {
  const speciesList = Object.keys(learnsets);
  const speciesId = randomItem(speciesList);
  const spec = species[speciesId];
  
  const ability = spec.abilities ? randomItem(spec.abilities) : null;
  const selectedMoves = getRandomMoves(speciesId);

  return {
    id: `g${Math.random().toString(36).slice(2)}`,
    species: speciesId,
    ability,
    moves: selectedMoves,
    score: 0,
    results: []
  };
}

function mutate(genome) {
  const newGenome = structuredClone(genome);
  newGenome.id = `m${Math.random().toString(36).slice(2)}`;

  // Mutate Species
  if (Math.random() < 0.3) {
    const speciesList = Object.keys(learnsets);
    newGenome.species = randomItem(speciesList);
    const spec = species[newGenome.species];
    newGenome.ability = spec.abilities ? randomItem(spec.abilities) : null;
    newGenome.moves = getRandomMoves(newGenome.species);
    return newGenome; // Big change, return early
  }

  // Mutate Ability
  if (Math.random() < 0.3) {
    const spec = species[newGenome.species];
    if (spec.abilities && spec.abilities.length > 0) {
      newGenome.ability = randomItem(spec.abilities);
    }
  }

  // Mutate Moves
  if (Math.random() < 0.6) {
    const allowed = learnsets[newGenome.species] || [];
    if (allowed.length > 0) {
      const slot = Math.floor(Math.random() * 4);
      // Try to find a new move not in current set
      let newMove = randomItem(allowed);
      let attempts = 0;
      while (newGenome.moves.includes(newMove) && attempts < 10) {
        newMove = randomItem(allowed);
        attempts++;
      }
      newGenome.moves[slot] = newMove;
    }
  }

  return newGenome;
}

function crossover(p1, p2) {
  const parentForBody = Math.random() < 0.5 ? p1 : p2;
  const otherParent = parentForBody === p1 ? p2 : p1;
  
  const child = {
    id: `c${Math.random().toString(36).slice(2)}`,
    species: parentForBody.species,
    ability: parentForBody.ability,
    moves: [],
    score: 0,
    results: []
  };

  const validMoves = new Set(learnsets[child.species] || []);
  const pool = new Set();
  
  // Combine moves from both parents that are valid for the child's species
  p1.moves.forEach(m => { if (validMoves.has(m)) pool.add(m); });
  p2.moves.forEach(m => { if (validMoves.has(m)) pool.add(m); });
  
  // If pool is too small, fill from validMoves
  if (pool.size < 4) {
    validMoves.forEach(m => pool.add(m));
  }

  // Pick 4 unique moves
  const poolArr = Array.from(pool);
  while (child.moves.length < 4 && poolArr.length > 0) {
    const idx = Math.floor(Math.random() * poolArr.length);
    child.moves.push(poolArr[idx]);
    poolArr.splice(idx, 1);
  }

  return child;
}

// --- Worker Management ---

function evaluatePopulationParallel(population) {
  return new Promise((resolve, reject) => {
    const workers = [];
    const resultsMap = new Map();
    let completed = 0;
    
    const numWorkers = Math.min(CONFIG.concurrency, population.length);
    const chunkSize = Math.ceil(population.length / numWorkers);

    // Create workers
    for (let i = 0; i < numWorkers; i++) {
      const w = new Worker(__filename);
      workers.push(w);

      w.on('message', (msg) => {
        if (msg.type === 'result') {
          resultsMap.set(msg.id, msg);
          completed++;
          process.stdout.write("."); // Progress dot
          
          if (completed === population.length) {
            process.stdout.write("\n");
            // All done, update population
            population.forEach(p => {
              const res = resultsMap.get(p.id);
              if (res) {
                p.score = res.score;
                p.results = res.results;
              } else {
                p.score = 0;
              }
            });
            // Cleanup
            workers.forEach(w => w.terminate());
            resolve();
          }
        }
      });
      
      w.on('error', (err) => {
        console.error("Worker error:", err);
      });
    }

    // Distribute tasks
    let workerIdx = 0;
    population.forEach(genome => {
      workers[workerIdx].postMessage({ type: 'evaluate', genome });
      workerIdx = (workerIdx + 1) % numWorkers;
    });
  });
}

// --- Visualization ---

function printVisualization(genome) {
  console.log(`\n=== 👑 最強個体データ ===`);
  console.log(`Species : ${genome.species}`);
  console.log(`Ability : ${genome.ability}`);
  console.log(`Moves   : ${genome.moves.join(", ")}`);
  console.log(`Score   : ${(genome.score * 100).toFixed(1)}%`);
  console.log(`\n--- 対戦詳細 (vs Meta) ---
`);
  
  const maxLen = Math.max(...genome.results.map(r => r.opponent.length));
  
  genome.results.forEach(r => {
    const barLen = Math.round(r.winRate * 20);
    const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
    const pct = (r.winRate * 100).toFixed(0).padStart(3);
    const name = r.opponent.padEnd(maxLen);
    
    // Check if result is 100% win or 0%
    let status = "";
    if (r.winRate >= 0.9) status = "✅ WIN ";
    else if (r.winRate <= 0.1) status = "❌ LOSE";
    else status = "⚖️  DRAW";

    console.log(`${name} | ${bar} ${pct}% ${status}`);
  });
  console.log("==========================\n");
}


// --- Main ---

async function main() {
  console.log(`\n🧬 並列遺伝的アルゴリズム探索を開始 (Threads: ${CONFIG.concurrency})`);
  console.log(`Target: ${CONFIG.populationSize} individuals x ${CONFIG.generations} generations`);
  
  let population = [];
  for (let i = 0; i < CONFIG.populationSize; i++) {
    population.push(createRandomGenome());
  }

  for (let gen = 0; gen < CONFIG.generations; gen++) {
    process.stdout.write(`Generation ${String(gen + 1).padStart(2)}: `);
    await evaluatePopulationParallel(population);
    
    // Sort
    population.sort((a, b) => b.score - a.score);
    
    const best = population[0];
    console.log(` -> Top: ${best.species} (${(best.score * 100).toFixed(1)}%)`);
    
    // Check if we converged early (optional, but good for debugging)
    // if (best.score >= 0.99) console.log("   (Near perfect score achieved)");

    // Evolution
    const nextGen = population.slice(0, CONFIG.eliteCount); // Elites
    
    // Roulette Wheel or Tournament? Let's stick to simple random pool from top 50%
    const poolSize = Math.floor(CONFIG.populationSize / 2);
    const parentPool = population.slice(0, poolSize);
    
    while (nextGen.length < CONFIG.populationSize) {
      const p1 = randomItem(parentPool);
      const p2 = randomItem(parentPool);
      let child = crossover(p1, p2);
      if (Math.random() < CONFIG.mutationRate) {
        child = mutate(child);
      }
      nextGen.push(child);
    }
    population = nextGen;
  }

  // Final Result
  const finalBest = population[0];
  printVisualization(finalBest);
}

if (require.main === module) {
  main();
}