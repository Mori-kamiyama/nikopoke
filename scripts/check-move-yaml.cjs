#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const movesDir = path.join(repoRoot, 'engine-rust', 'data', 'moves');

const yaml = require(
  require.resolve('js-yaml', {
    paths: [frontendRoot],
  }),
);

function listYamlFiles(rootDir) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
        files.push(fullPath);
      }
    }
  }
  walk(rootDir);
  files.sort((a, b) => a.localeCompare(b, 'en'));
  return files;
}

function collectMoves(doc) {
  if (!doc || typeof doc !== 'object') {
    return [];
  }
  if (typeof doc.id === 'string') {
    return [doc];
  }
  return Object.values(doc).filter((entry) => entry && typeof entry === 'object');
}

function scanEffect(effect, issues, filePath, moveId, trail) {
  if (!effect || typeof effect !== 'object') {
    return;
  }

  const label = `${filePath} :: ${moveId} :: ${trail}`;

  if (effect.target === 'opponent') {
    issues.push(`${label} uses target: opponent (use target: target)`);
  }

  if (typeof effect.accuracy === 'number' && effect.accuracy > 1 && effect.accuracy <= 100) {
    issues.push(`${label} has accuracy ${effect.accuracy} (use 0-1 scale)`);
  }

  if (typeof effect.chance === 'number' && effect.chance > 1 && effect.chance <= 100) {
    issues.push(`${label} has chance ${effect.chance} (use 0-1 scale)`);
  }

  if (effect.type === 'apply_status' && effect.turns !== undefined && effect.duration === undefined) {
    issues.push(`${label} uses turns without duration`);
  }

  if (effect.type === 'modify_stage' && typeof effect.stat === 'string' && typeof effect.stages === 'number') {
    issues.push(`${label} uses stat/stages scalar (prefer stages map)`);
  }

  if (effect.type === 'damage_ratio' && effect.ratio !== undefined) {
    issues.push(`${label} uses ratio (prefer ratioCurrentHp/ratioMaxHp)`);
  }

  if (Array.isArray(effect.steps)) {
    effect.steps.forEach((entry, index) => scanEffect(entry, issues, filePath, moveId, `${trail}.steps[${index}]`));
  }
  if (Array.isArray(effect.then)) {
    effect.then.forEach((entry, index) => scanEffect(entry, issues, filePath, moveId, `${trail}.then[${index}]`));
  }
  if (Array.isArray(effect.else)) {
    effect.else.forEach((entry, index) => scanEffect(entry, issues, filePath, moveId, `${trail}.else[${index}]`));
  }
}

function main() {
  const files = listYamlFiles(movesDir);
  const issues = [];

  for (const filePath of files) {
    const doc = yaml.load(fs.readFileSync(filePath, 'utf8'));
    const moves = collectMoves(doc);

    for (const move of moves) {
      const moveId = move.id || path.basename(filePath, '.yaml');
      if (move.target === 'opponent') {
        issues.push(`${filePath} :: ${moveId} uses top-level target: opponent (use target: target)`);
      }
      if (typeof move.accuracy === 'number' && move.accuracy > 1 && move.accuracy <= 100) {
        issues.push(`${filePath} :: ${moveId} has accuracy ${move.accuracy} (use 0-1 scale)`);
      }
      if (!Array.isArray(move.steps)) {
        continue;
      }
      move.steps.forEach((effect, index) => scanEffect(effect, issues, filePath, moveId, `steps[${index}]`));
    }
  }

  if (issues.length === 0) {
    console.log('Move YAML check passed.');
    return;
  }

  console.error(`Move YAML issues: ${issues.length}`);
  for (const issue of issues.slice(0, 300)) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

main();
