const fs = require("fs");
const path = require("path");

const { species } = require(path.resolve(__dirname, "../../engine/data/species"));
const flat = species?.gen1Species ? { ...species.gen1Species } : species;
const outPath = path.resolve(__dirname, "../data/species.json");

fs.writeFileSync(outPath, JSON.stringify(flat, null, 2));
console.log(`Wrote ${outPath}`);
