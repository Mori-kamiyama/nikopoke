const fs = require('fs');

const moves = JSON.parse(fs.readFileSync('engine-rust/data/moves.json', 'utf8'));
const learnsets = JSON.parse(fs.readFileSync('engine-rust/data/learnsets.json', 'utf8'));

const moveIds = new Set(Object.keys(moves));
const missingMoves = new Set();

for (const species in learnsets) {
  for (const moveId of learnsets[species]) {
    if (!moveIds.has(moveId)) {
      missingMoves.add(moveId);
    }
  }
}

console.log('Missing Moves:', Array.from(missingMoves).sort());
