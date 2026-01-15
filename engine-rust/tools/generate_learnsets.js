// generate_learnsets.js
// This script reads the CSV file containing move learnsets per species,
// maps Japanese move names to their IDs from moves.json, and writes
// engine-rust/data/learnsets.json.

const fs = require('fs');
const path = require('path');

// Paths (relative to project root)
const csvPath = path.resolve(__dirname, '../data/2期生男子種族値 - 技一覧.csv');
const movesPath = path.resolve(__dirname, '../data/moves.json');
const outPath = path.resolve(__dirname, '../data/learnsets.json');

// Load moves and build name -> id map (using the Japanese name field)
const movesData = JSON.parse(fs.readFileSync(movesPath, 'utf8'));
const nameToId = {};
for (const [id, move] of Object.entries(movesData)) {
    if (move.name) {
        nameToId[move.name] = id;
    }
}

// Helper to split CSV line on commas not inside double quotes
function splitCsv(line) {
    // Split on commas that are followed by an even number of quotes ahead (i.e., outside quotes)
    return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(f => {
        // Remove surrounding quotes if present and trim whitespace
        let s = f.trim();
        if (s.startsWith('"') && s.endsWith('"')) {
            s = s.slice(1, -1);
        }
        return s;
    });
}

// Read CSV file
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);

const learnsets = {};

for (const line of lines) {
    const fields = splitCsv(line);
    // Expect at least 2 columns: move name and species list
    const moveName = fields[0];
    const speciesListRaw = fields[1] || '';
    const moveId = nameToId[moveName];
    if (!moveId) {
        // Skip moves that are not in moves.json
        continue;
    }
    // Species are separated by Japanese comma "、"
    const species = speciesListRaw.split('、').map(s => s.trim()).filter(Boolean);
    for (const sp of species) {
        if (!learnsets[sp]) {
            learnsets[sp] = [];
        }
        learnsets[sp].push(moveId);
    }
}

// Write output
fs.writeFileSync(outPath, JSON.stringify(learnsets, null, 2), 'utf8');
console.log(`Generated learnsets.json with ${Object.keys(learnsets).length} species.`);
