const rawTypes = [
  { type: "Normal", super_effective: "Fighting", resists: "None", weak_to: "Fighting" },
  { type: "Fire", super_effective: "Grass, Ice, Bug, Steel", resists: "Grass, Ice, Bug, Steel, Fairy", weak_to: "Water, Ground, Rock" },
  { type: "Water", super_effective: "Fire, Ground, Rock", resists: "Steel, Fire, Water", weak_to: "Electric, Grass" },
  { type: "Electric", super_effective: "Water, Flying", resists: "Flying, Steel, Electric", weak_to: "Ground" },
  { type: "Grass", super_effective: "Water, Ground, Rock", resists: "Ground, Water, Grass", weak_to: "Fire, Ice, Poison, Flying, Bug" },
  { type: "Ice", super_effective: "Flying, Ground, Grass, Dragon", resists: "Ice", weak_to: "Fire, Fighting, Rock, Steel" },
  { type: "Fighting", super_effective: "Normal, Ice, Rock, Dark, Steel", resists: "Rock, Bug, Dark", weak_to: "Flying, Psychic, Fairy" },
  { type: "Poison", super_effective: "Grass, Fairy", resists: "Grass, Fighting, Poison, Bug", weak_to: "Ground, Psychic" },
  { type: "Ground", super_effective: "Fire, Electric, Poison, Rock, Steel", resists: "Poison, Rock", weak_to: "Water, Grass, Ice" },
  { type: "Flying", super_effective: "Fighting, Bug, Grass", resists: "Fighting, Bug, Grass", weak_to: "Electric, Ice, Rock" },
  { type: "Psychic", super_effective: "Fighting, Poison", resists: "Fighting, Psychic", weak_to: "Bug, Ghost, Dark" },
  { type: "Bug", super_effective: "Grass, Psychic, Dark", resists: "Grass, Fighting, Ground", weak_to: "Fire, Flying, Rock" },
  { type: "Rock", super_effective: "Flying, Bug, Fire, Ice", resists: "Normal, Flying, Poison, Fire", weak_to: "Water, Grass, Fighting, Ground, Steel" },
  { type: "Ghost", super_effective: "Ghost, Psychic", resists: "Poison, Bug", weak_to: "Ghost, Dark" },
  { type: "Dragon", super_effective: "Dragon", resists: "Grass, Fire, Water, Electric", weak_to: "Ice, Dragon, Fairy" },
  { type: "Dark", super_effective: "Ghost, Psychic", resists: "Ghost, Dark", weak_to: "Fighting, Bug, Fairy" },
  { type: "Steel", super_effective: "Ice, Rock, Fairy", resists: "Normal, Flying, Rock, Bug, Steel, Grass, Psychic, Ice, Dragon, Fairy", weak_to: "Fire, Water, Ground" },
  { type: "Fairy", super_effective: "Fighting, Dragon, Dark", resists: "Fighting, Bug, Dark", weak_to: "Poison, Steel" },
];

function normalizeList(value) {
  if (!value || value.toLowerCase() === "none") return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const typeChart = rawTypes.reduce((acc, entry) => {
  const key = entry.type.toLowerCase();
  acc[key] = {
    superEffective: normalizeList(entry.super_effective),
    resists: normalizeList(entry.resists),
    weakTo: normalizeList(entry.weak_to),
  };
  return acc;
}, {});

const typeImmunities = {
  normal: ["ghost"],
  ghost: ["normal", "fighting"],
  steel: ["poison"],
  flying: ["ground"],
  dark: ["psychic"],
  ground: ["electric"],
  fairy: ["dragon"],
};

function getTypeEffectiveness(moveType, targetTypes) {
  if (!moveType) return 1;
  const moveKey = moveType.toLowerCase();
  const targets = (targetTypes ?? []).map((t) => t.toLowerCase());
  let multiplier = 1;
  for (const targetType of targets) {
    const immunities = typeImmunities[targetType];
    if (immunities?.includes(moveKey)) return 0;
    const chart = typeChart[targetType];
    if (!chart) continue;
    if (chart.weakTo.includes(moveKey)) multiplier *= 2;
    if (chart.resists.includes(moveKey)) multiplier *= 0.5;
  }
  return multiplier;
}

module.exports = { typeChart, typeImmunities, getTypeEffectiveness };
