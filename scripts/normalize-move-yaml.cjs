#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const engineMovesDir = path.join(repoRoot, 'engine-rust', 'data', 'moves');

const yaml = require(
  require.resolve('js-yaml', {
    paths: [frontendRoot],
  }),
);

const STAT_KEY_MAP = {
  attack: 'atk',
  atk: 'atk',
  defense: 'def',
  def: 'def',
  spattack: 'spa',
  spa: 'spa',
  specialattack: 'spa',
  spdefense: 'spd',
  spd: 'spd',
  specialdefense: 'spd',
  speed: 'spe',
  spe: 'spe',
  accuracy: 'accuracy',
  evasion: 'evasion',
  crit: 'crit',
};

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
  };
}

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

function normalizeTarget(target) {
  if (typeof target !== 'string') {
    return target;
  }
  if (target === 'opponent') {
    return 'target';
  }
  if (target === 'user') {
    return 'self';
  }
  return target;
}

function normalizeRate(value) {
  if (typeof value !== 'number') {
    return value;
  }
  if (value > 1 && value <= 100) {
    return Math.round((value / 100) * 10000) / 10000;
  }
  return value;
}

function normalizeStatKey(stat) {
  if (typeof stat !== 'string') {
    return null;
  }
  const normalized = stat.replace(/[^a-zA-Z]/g, '').toLowerCase();
  return STAT_KEY_MAP[normalized] || null;
}

function normalizeEffect(effect) {
  if (!effect || typeof effect !== 'object') {
    return effect;
  }
  const next = { ...effect };

  if (Object.prototype.hasOwnProperty.call(next, 'target')) {
    next.target = normalizeTarget(next.target);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'accuracy')) {
    next.accuracy = normalizeRate(next.accuracy);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'chance')) {
    next.chance = normalizeRate(next.chance);
  }

  if (next.type === 'apply_status' && next.turns !== undefined && next.duration === undefined) {
    next.duration = next.turns;
    delete next.turns;
  }

  if (next.type === 'modify_stage' && typeof next.stat === 'string' && typeof next.stages === 'number') {
    const key = normalizeStatKey(next.stat);
    if (key) {
      next.stages = { [key]: next.stages };
      delete next.stat;
    }
  }

  if (next.type === 'damage_ratio' && typeof next.ratio === 'number') {
    if (next.ratioCurrentHp === undefined && next.ratioMaxHp === undefined) {
      if (next.basis === 'current') {
        next.ratioCurrentHp = next.ratio;
      } else {
        next.ratioMaxHp = next.ratio;
      }
    }
    delete next.ratio;
    delete next.basis;
  }

  if (Array.isArray(next.steps)) {
    next.steps = next.steps.map(normalizeEffect);
  }
  if (Array.isArray(next.then)) {
    next.then = next.then.map(normalizeEffect);
  }
  if (Array.isArray(next.else)) {
    next.else = next.else.map(normalizeEffect);
  }

  return next;
}

function normalizeMove(move) {
  if (!move || typeof move !== 'object') {
    return move;
  }
  const next = { ...move };

  if (Object.prototype.hasOwnProperty.call(next, 'accuracy')) {
    next.accuracy = normalizeRate(next.accuracy);
  }

  if (!Array.isArray(next.tags)) {
    next.tags = [];
  }

  if (Array.isArray(next.steps)) {
    next.steps = next.steps.map(normalizeEffect);
  }

  return next;
}

function normalizeYamlRoot(doc) {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }

  // Single move file.
  if (typeof doc.id === 'string') {
    return normalizeMove(doc);
  }

  // Multi-move file: { move_id: { ... }, ... }
  const next = {};
  for (const [key, value] of Object.entries(doc)) {
    next[key] = normalizeMove(value);
  }
  return next;
}

function main() {
  const { write } = parseArgs(process.argv.slice(2));
  const files = listYamlFiles(engineMovesDir);
  let changedCount = 0;
  const changedFiles = [];

  for (const filePath of files) {
    const originalText = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(originalText);
    const normalized = normalizeYamlRoot(parsed);
    const nextText = yaml.dump(normalized, {
      noRefs: true,
      sortKeys: false,
      lineWidth: 120,
    });

    if (nextText !== originalText) {
      changedCount += 1;
      changedFiles.push(filePath);
      if (write) {
        fs.writeFileSync(filePath, nextText);
      }
    }
  }

  console.log(write ? 'Normalized move YAML files:' : 'Files that would be normalized:');
  console.log(`- count: ${changedCount}`);
  for (const filePath of changedFiles) {
    console.log(`- ${filePath}`);
  }
  if (!write && changedCount > 0) {
    console.log('Run with --write to apply changes.');
  }
}

main();
