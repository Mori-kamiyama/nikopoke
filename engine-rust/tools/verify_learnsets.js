// verify_learnsets.js
// Checks that all move IDs in learnsets.json exist in moves.json

const fs = require('fs');
const path = require('path');

const movesPath = path.resolve(__dirname, '../data/moves.json');
const learnsetsPath = path.resolve(__dirname, '../data/learnsets.json');

const moves = JSON.parse(fs.readFileSync(movesPath, 'utf8'));
const learnsets = JSON.parse(fs.readFileSync(learnsetsPath, 'utf8'));

const moveIds = new Set(Object.keys(moves));
let missing = [];
for (const [species, ids] of Object.entries(learnsets)) {
    for (const id of ids) {
        if (!moveIds.has(id)) {
            missing.push({ species, id });
        }
    }
}
if (missing.length === 0) {
    console.log('All move IDs are valid.');
    process.exit(0);
} else {
    console.error('Missing move IDs:', missing);
    process.exit(1);
}
