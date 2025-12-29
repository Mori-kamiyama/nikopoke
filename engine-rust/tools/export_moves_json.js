const fs = require("fs");
const path = require("path");

const moves = require(path.resolve(__dirname, "../../engine/data/moves"));
const outPath = path.resolve(__dirname, "../data/moves.json");

fs.writeFileSync(outPath, JSON.stringify(moves.moves ?? moves, null, 2));
console.log(`Wrote ${outPath}`);
