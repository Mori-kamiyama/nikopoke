const fs = require("fs");
const path = require("path");

const { learnsets } = require(path.resolve(__dirname, "../../engine/data/learnsets"));
const outPath = path.resolve(__dirname, "../data/learnsets.json");

fs.writeFileSync(outPath, JSON.stringify(learnsets, null, 2));
console.log(`Wrote ${outPath}`);
