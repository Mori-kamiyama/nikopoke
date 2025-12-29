const { moves } = require("../data/moves");
const { applyEvent } = require("../core/events");
const { isStatusMove, isReflectableStatusEvent, getActiveCreature } = require("../core/utils");

const registry = {
  // --- Switching & Turn Triggers ---
  intimidate: {
    onSwitchIn: ({ state, player }) => {
      if (player.active.abilityData?.intimidateUsed) return {};
      let next = markAbilityUsed(state, player.id, "intimidateUsed");
      const events = [];
      for (const other of next.players) {
        if (other.id === player.id) continue;
        const target = getActiveCreature(next, other.id);
        if (!target) continue;
        // Immunity check via hook
        if (runAbilityCheckHook(next, other.id, "onImmunity", { source: player.id, type: "intimidate" })) {
             continue;
        }
        events.push({
          type: "modify_stage",
          targetId: other.id,
          stages: { atk: -1 },
          meta: { source: player.id },
        });
      }
      return { state: next, events };
    },
  },
  download: {
    onSwitchIn: ({ state, player }) => {
      if (player.active.abilityData?.downloadUsed) return {};
      const targetPlayer = state.players.find((p) => p.id !== player.id);
      if (!targetPlayer) return {};
      const target = getActiveCreature(state, targetPlayer.id);
      if (!target) return {};
      
      const raise =
        (target.defense ?? 0) < (target.spDefense ?? 0)
          ? "atk"
          : "spa";
      const next = markAbilityUsed(state, player.id, "downloadUsed");
      return {
        state: next,
        events: [
          {
            type: "modify_stage",
            targetId: player.id,
            stages: { [raise]: 1 },
            meta: { source: player.id },
          },
        ],
      };
    },
  },
  drought: {
    onSwitchIn: ({ state, player }) => {
      if (player.active.abilityData?.droughtUsed) return {};
      let next = markAbilityUsed(state, player.id, "droughtUsed");
      next = setWeather(next, "sun", 5);
      next = applyEvent(next, {
        type: "log",
        message: "The sunlight turned harsh.",
      });
      return { state: next, events: [] };
    },
  },
  moody: {
    onTurnEnd: ({ state, player, rng }) => {
      const stats = ["atk", "def", "spa", "spd", "spe"];
      const up = stats[Math.floor((rng?.() ?? Math.random()) * stats.length)];
      let down = up;
      while (down === up) {
        down = stats[Math.floor((rng?.() ?? Math.random()) * stats.length)];
      }
      return {
        events: [
          {
            type: "modify_stage",
            targetId: player.id,
            stages: { [up]: 2, [down]: -1 },
            meta: { source: player.id },
          },
        ],
      };
    },
  },

  // --- Defensive / Reaction ---
  magic_bounce: {
    onTryHit: ({ event, player }) => {
      const sourceId = event.meta?.source;
      const targetId = event.targetId;
      const move = moves[event.meta?.moveId];

      if (
        isReflectableStatusEvent(event.type) &&
        sourceId &&
        sourceId !== targetId &&
        !event.meta?.bounced &&
        isStatusMove(move)
      ) {
        return [
          {
            type: "log",
            message: `${player.active.name} bounced the move back!`,
          },
          {
            ...event,
            targetId: sourceId,
            meta: { ...event.meta, source: targetId, bounced: true },
          },
        ];
      }
      return null;
    },
  },
  lightning_rod: {
    onTryHit: ({ event, player }) => {
      const move = moves[event.meta?.moveId];
      if (event.type === "damage" && move?.type === "electric") {
        return [
          {
            type: "modify_stage",
            targetId: player.id,
            stages: { spa: 1 },
            meta: { source: player.id },
          },
          {
            type: "log",
            message: `${player.active.name} drew in the electricity!`,
          },
        ];
      }
      return null;
    },
  },
  stamina: {
    onAfterEvent: ({ event, player }) => {
      if (event.type === "damage" && event.targetId === player.id) {
        return [
          {
            type: "modify_stage",
            targetId: player.id,
            stages: { def: 1 },
            meta: { source: player.id },
          },
        ];
      }
      return null;
    },
  },
  cotton_down: {
    onAfterEvent: ({ state, event, player }) => {
      if (event.type === "damage" && event.targetId === player.id) {
        const events = [];
        for (const other of state.players) {
          if (other.id === player.id) continue;
          events.push({
            type: "modify_stage",
            targetId: other.id,
            stages: { spe: -1 },
            meta: { source: player.id },
          });
        }
        return events;
      }
      return null;
    },
  },
  berserk: {
    onAfterEvent: ({ event, player }) => {
      const target = player.active;
      if (
        event.type === "damage" &&
        event.targetId === player.id &&
        target.hp > target.maxHp / 2 &&
        target.hp - event.amount <= target.maxHp / 2
      ) {
        return [
          {
            type: "modify_stage",
            targetId: player.id,
            stages: { spa: 1 },
            meta: { source: player.id },
          },
        ];
      }
      return null;
    },
  },
  competitive: {
    onAfterEvent: ({ event, player }) => {
      const sourceId = event.meta?.source;
      if (
        event.type === "modify_stage" &&
        event.targetId === player.id &&
        sourceId &&
        sourceId !== player.id &&
        !event.meta?.competitive
      ) {
        const hasDrop = Object.values(event.stages ?? {}).some((v) => v < 0);
        if (hasDrop) {
          return [
            {
              type: "modify_stage",
              targetId: player.id,
              stages: { spa: 2 },
              meta: { source: player.id, competitive: true },
            },
          ];
        }
      }
      return null;
    },
  },
  opportunist: {
    onAfterEvent: ({ event, player }) => {
      const sourceId = event.meta?.source;
      if (
        event.type === "modify_stage" &&
        event.targetId !== player.id && // Target is NOT self
        !event.meta?.opportunist
      ) {
        const boosts = onlyPositiveStages(event.stages ?? {});
        if (Object.keys(boosts).length > 0) {
          return [
            {
              type: "modify_stage",
              targetId: player.id,
              stages: boosts,
              meta: { source: player.id, opportunist: true },
            },
          ];
        }
      }
      return null;
    },
  },

  // --- Immunities ---
  immunity: {
    onCheckStatusImmunity: ({ statusId }) => statusId === "poison" || statusId === "toxic",
  },
  insomnia: {
    onCheckStatusImmunity: ({ statusId }) => statusId === "sleep",
  },
  own_tempo: {
    onCheckStatusImmunity: ({ statusId }) => statusId === "confusion",
    onImmunity: ({ type }) => type === "intimidate",
  },
  clear_body: {
      onImmunity: ({ type }) => type === "intimidate", // Simplification
  },
  white_smoke: {
      onImmunity: ({ type }) => type === "intimidate", // Simplification
  },
  hyper_cutter: {
      onImmunity: ({ type }) => type === "intimidate", // Simplification
  },
  thick_fat: {
    onDefensivePower: ({ value, move }) => {
      if (move?.type === "fire" || move?.type === "ice") return value * 0.5;
      return value;
    },
  },

  // --- Stats & Stages ---
  contrary: {
    onModifyStage: ({ stages }) => {
      const inverted = {};
      for (const [k, v] of Object.entries(stages)) inverted[k] = -v;
      return inverted;
    }
  },
  simple: {
    onModifyStage: ({ stages }) => {
        const doubled = {};
        for (const [k, v] of Object.entries(stages)) doubled[k] = v * 2;
        return doubled;
    }
  },
  unaware: {
    onModifyOffense: ({ value, stage }) => {
        // Ignore attacker's positive stat changes? 
        // No, Unaware ignores the opponent's stat changes.
        // When Attacking (ModifyOffense is called for attacker), ignore Target's Def/SpD stages?
        // Wait, Unaware ignores TARGET's defensive boosts when attacking, and ATTACKER's offensive boosts when defending.
        // My hook design needs to distinguish who is calling.
        // Hook is called on the creature being evaluated.
        // If I am attacking, I ignore target's def stages. (This is handled in resolveOffenseDefense by checking target ability)
        // If I am defending, I ignore attacker's atk stages.
        // Let's stick to the previous hardcoded logic's pattern but moved here:
        // Actually, resolveOffenseDefense logic was:
        // if (attacker.ability === "unaware") defStage = 0;
        // if (target.ability === "unaware") atkStage = 0;
        // So `unaware` on self means "Ignore opponent's stages when I interact with them".
        // This is complex for a simple value hook unless we pass context.
        return value; // Handled specially or needs context
    }
    // We will handle Unaware in resolveOffenseDefense by checking hooks on BOTH attacker and target.
  },
  fur_coat: {
      onModifyDefense: ({ value, category }) => category === "physical" ? value * 2 : value,
  },
  slow_start: {
      onModifyOffense: ({ value, category, turn }) => (turn <= 5 && category === "physical") ? value * 0.5 : value,
      onModifySpeed: ({ value, turn }) => (turn <= 5) ? value * 0.5 : value,
  },

  // --- Offense & Power ---
  sharpness: {
    onModifyPower: ({ value, move }) =>
      move?.tags?.includes("slicing") ? value * 1.5 : value,
  },
  technician: {
    onModifyPower: ({ value }) => value <= 60 ? value * 1.5 : value,
  },
  steelworker: {
    onModifyPower: ({ value, move }) => move?.type === "steel" ? value * 1.5 : value,
  },
  hustle: {
    onModifyPower: ({ value, category }) =>
      category === "physical" ? value * 1.5 : value,
    onModifyAccuracy: ({ value, category }) =>
      category === "physical" ? value * 0.8 : value,
  },
  pure_power: {
    onModifyPower: ({ value, category }) => category === "physical" ? value * 2 : value,
  },
  guts: {
    onModifyPower: ({ value, category, player }) => {
      if (category === "physical" && player.active.statuses.length > 0) {
        return value * 1.5;
      }
      return value;
    },
  },
  
  // --- Crit & Accuracy ---
  merciless: {
    onModifyCritChance: ({ value, target }) => {
      if (target?.statuses?.some((s) => s.id === "poison" || s.id === "toxic")) {
        return 999;
      }
      return value;
    },
  },
  super_luck: {
    onModifyCritChance: ({ value }) => value + 1,
  },
  compound_eyes: {
    onModifyAccuracy: ({ value }) => value * 1.3,
  },

  // --- Speed & Priority ---
  quick_feet: {
      onModifySpeed: ({ value, player }) => player.active.statuses.length > 0 ? value * 1.5 : value,
  },
  swift_swim: {
      onModifySpeed: ({ value, weather }) => weather === "rain" ? value * 2 : value,
  },
  chlorophyll: {
      onModifySpeed: ({ value, weather }) => weather === "sun" ? value * 2 : value,
  },
  prankster: {
    onModifyPriority: ({ value, move }) => isStatusMove(move) ? value + 1 : value,
  },

  // --- Special ---
  libero: {
    onBeforeAction: ({ player, action, state }) => {
      const moveId = action.action?.moveId;
      const move = moves[moveId];
      if (!move?.type) return {};
      if (player.active.abilityData?.liberoUsed) return {};

      const next = structuredClone(state);
      const p = next.players.find((pl) => pl.id === player.id);
      const c = p?.team[p.activeSlot];
      if (!c) return {};

      c.types = [move.type];
      c.abilityData = { ...(c.abilityData ?? {}), liberoUsed: true };

      return {
        state: next,
        events: [
          {
            type: "log",
            message: `${player.active.name} transformed into ${move.type} type!`,
          },
        ],
      };
    },
  },
  
  // --- Missing / No-op / Placeholders ---
  receiver: {
    onSwitchIn: ({ state, player }) => copyFaintedAbility(state, player, "receiver"),
  },
  power_of_alchemy: {
    onSwitchIn: ({ state, player }) =>
      copyFaintedAbility(state, player, "power_of_alchemy"),
  },
  klutz: { onCheckItem: () => false },
  shadow_tag: { 
    onTrap: ({ player, targetId, state }) => {
      if (!targetId || targetId === player.id) return false;
      const target = getActiveCreature(state, targetId);
      // Shadow Tag users are immune to Shadow Tag
      if (target?.ability === "shadow_tag") return false;
      return true;
    }
  },
  unnerve: { onCheckItem: () => false },
  skill_link: { onSkillLink: () => true },
};

const BAN_COPY_ABILITIES = [
  "receiver",
  "power_of_alchemy",
  "trace",
  "wonder_guard",
  "forecast",
  "flower_gift",
  "multitype",
  "illusion",
  "imposter",
  "stance_change",
  "power_construct",
  "schooling",
  "comatose",
  "shields_down",
  "disguise",
  "battle_bond",
  "rk_system",
  "ice_face",
  "gulp_missile",
  "hung_switch",
  "commander",
  "quark_drive",
  "protosynthesis",
];

function getAbility(id) {
  return registry[id];
}

// Helper for value modification hooks (Power, Speed, Accuracy, etc.)
function runAbilityValueHook(state, playerId, hook, initialValue, ctx = {}) {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return initialValue;
    const active = getActiveCreature(state, playerId);
    if (!active || !active.ability) return initialValue;

    const impl = getAbility(active.ability);
    if (impl && impl[hook]) {
        return impl[hook]({ 
            state, 
            player: { ...player, active }, 
            value: initialValue,
            ...ctx 
        }) ?? initialValue;
    }
    return initialValue;
}

// Helper for boolean/check hooks (Immunity, etc.)
function runAbilityCheckHook(state, playerId, hook, ctx = {}, defaultValue = false) {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return defaultValue;
    const active = getActiveCreature(state, playerId);
    if (!active || !active.ability) return defaultValue;

    const impl = getAbility(active.ability);
    if (impl && impl[hook]) {
        return impl[hook]({ 
            state, 
            player: { ...player, active }, 
            ...ctx 
        });
    }
    return defaultValue;
}

function runAbilityHooks(state, playerId, hook, ctx = {}) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { state, events: [] };
  
  const active = getActiveCreature(state, playerId);
  if (!active) return { state, events: [] };

  const impl = getAbility(active.ability);
  const handler = impl?.[hook];
  if (!handler) return { state, events: [] };
  
  const playerProxy = { ...player, active };

  const result = handler({ state, player: playerProxy, ...ctx }) || {};
  return {
    state: result.state ?? state,
    events: result.events ?? [],
    overrideAction: result.overrideAction,
    preventAction: result.preventAction
  };
}

function runAllAbilityHooks(state, hook, ctx = {}) {
  let workingState = state;
  const events = [];
  for (const player of workingState.players) {
    const result = runAbilityHooks(workingState, player.id, hook, ctx);
    workingState = result.state;
    if (result.events) events.push(...result.events);
  }
  return { state: workingState, events };
}

function applyAbilityEventModifiers(state, events) {
  const output = [];
  for (const ev of events) {
    let currentEvents = [ev];

    // 1. Interceptors (Target only)
    if (ev.targetId) {
      const targetPlayer = state.players.find((p) => p.id === ev.targetId);
      const targetCreature = getActiveCreature(state, ev.targetId);
      const ability = targetCreature ? getAbility(targetCreature.ability) : null;
      if (ability?.onTryHit) {
        const playerProxy = targetPlayer ? { ...targetPlayer, active: targetCreature } : null;
        
        const replacement = ability.onTryHit({
          state,
          event: ev,
          player: playerProxy,
        });
        if (replacement) {
          currentEvents = replacement;
        }
      }
    }

    // 2. Reactors (Broadcast to all players)
    for (const processedEv of currentEvents) {
      output.push(processedEv);

      for (const player of state.players) {
        const active = getActiveCreature(state, player.id);
        const ability = active ? getAbility(active.ability) : null;
        
        if (ability?.onAfterEvent) {
          const playerProxy = { ...player, active };
          const reactions = ability.onAfterEvent({
            state,
            event: processedEv,
            player: playerProxy,
          });
          if (reactions) {
            output.push(...reactions);
          }
        }
      }
    }
  }
  return output;
}

function onlyPositiveStages(stages) {
  const result = {};
  for (const [key, delta] of Object.entries(stages)) {
    if (delta > 0) result[key] = delta;
  }
  return result;
}

function copyFaintedAbility(state, player, abilityId) {
  const last = player?.lastFaintedAbility;
  if (!last) return {};
  if (last === abilityId || BAN_COPY_ABILITIES.includes(last)) {
    return {};
  }

  const next = structuredClone(state);
  const p = next.players.find((pl) => pl.id === player.id);
  const c = p?.team[p.activeSlot];
  if (!c || c.ability !== abilityId) return {};

  c.ability = last;
  c.abilityData = { ...(c.abilityData ?? {}), copiedAbility: last };
  return {
    state: next,
    events: [
      { type: "log", message: `${c.name} copied ${last}!` },
    ],
  };
}

function setWeather(state, id, turns) {
  const next = structuredClone(state);
  next.field.global = (next.field.global ?? []).filter(
    (e) => e.id !== "sun" && e.id !== "rain"
  );
  next.field.global.push({
    id,
    remainingTurns: turns ?? null,
    data: {},
  });
  return next;
}

function markAbilityUsed(state, playerId, key) {
  const next = structuredClone(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) return state;
  const creature = next.players.find(p => p.id === playerId).team[player.activeSlot];
  if (creature) {
    creature.abilityData = {
        ...(creature.abilityData ?? {}),
        [key]: true,
    };
  }
  return next;
}

function getWeather(state) {
  const weather = (state.field?.global ?? []).find(
    (e) => e.id === "sun" || e.id === "rain"
  );
  return weather?.id ?? null;
}

module.exports = {
  getAbility,
  runAbilityHooks,
  runAllAbilityHooks,
  runAbilityValueHook,
  runAbilityCheckHook,
  applyAbilityEventModifiers,
  getWeather,
};
