/**
 * Status implementations with simple hooks.
 */

const { applyEvent } = require("../core/events");
const { getActiveCreature } = require("../core/utils");
const { applyEffects } = require("../effects"); // Required for delayed/over_time effects

const registry = {
  burn: {
    onTurnEnd: ({ player }) => {
      const damage = Math.floor(player.active.maxHp / 16);
      return {
        events: [
          {
            type: "damage",
            targetId: player.id,
            amount: Math.max(1, damage),
            meta: { from: "burn" },
          },
          {
            type: "log",
            message: `${player.active.name} is hurt by its burn!`,
          },
        ],
      };
    },
    onModifyStat: ({ stat, value }) => {
      if (stat === "atk") return value * 0.5;
      return value;
    },
  },
  poison: {
    onTurnEnd: ({ player }) => {
      const damage = Math.floor(player.active.maxHp / 8);
      return {
        events: [
          {
            type: "damage",
            targetId: player.id,
            amount: Math.max(1, damage),
            meta: { from: "poison" },
          },
          {
            type: "log",
            message: `${player.active.name} is hurt by poison!`,
          },
        ],
      };
    },
  },
  paralysis: {
    onModifyStat: ({ stat, value }) => {
      if (stat === "spe") return value * 0.5;
      return value;
    },
    onBeforeAction: ({ rng }) => {
      if (rng() < 0.25) {
        return {
          preventAction: true,
          events: [
            {
              type: "log",
              message: "It is fully paralyzed!",
            },
          ],
        };
      }
      return {};
    },
  },
  sleep: {
    onBeforeAction: ({ player }) => {
      return {
        preventAction: true,
        events: [{ type: "log", message: `${player.active.name} is fast asleep.` }],
      };
    },
  },
  freeze: {
    onBeforeAction: ({ player, rng }) => {
      if (rng() < 0.2) {
        return {
          events: [
            { type: "remove_status", targetId: player.id, statusId: "freeze" },
            { type: "log", message: `${player.active.name} thawed out!` },
          ],
        };
      }
      return {
        preventAction: true,
        events: [{ type: "log", message: `${player.active.name} is frozen solid!` }],
      };
    },
  },
  confusion: {
    onBeforeAction: ({ player, rng }) => {
      if (rng() < 0.33) {
        const damage = Math.floor(player.active.maxHp * 0.1); 
        return {
          preventAction: true,
          events: [
            { type: "log", message: `${player.active.name} hurt itself in its confusion!` },
            {
              type: "damage",
              targetId: player.id,
              amount: Math.max(1, damage),
              meta: { from: "confusion" },
            },
          ],
        };
      }
      return {};
    },
  },
  flinch: {
    onBeforeAction: () => {
      return {
        preventAction: true,
        events: [{ type: "log", message: "It flinched!" }],
      };
    },
  },
  protect: {
      onEventTransform: ({ events, player }) => {
          const incoming = events.filter(e => e.targetId === player.id);
          if (incoming.length === 0) return {};
          
          const transforms = [];
          const protectedTypes = new Set();

          for(const ev of incoming) {
              if (ev.type === "damage" || ev.type === "apply_status" || ev.type === "modify_stage") {
                  if (ev.meta?.source === player.id) continue;
                  
                  if (!protectedTypes.has(ev.type)) {
                      transforms.push({
                          type: "replace_event",
                          from: ev.type,
                          targetId: player.id,
                          to: [{ type: "log", message: `${player.active.name} protected itself!` }],
                      });
                      protectedTypes.add(ev.type);
                  }
              }
          }
          return { eventTransforms: transforms };
      }
  },
  lock_move: {
    onBeforeAction: ({ player, action, state, status }) => {
      const mode = status?.data?.mode;
      const data = status?.data ?? {};
      const lastMove =
        player.active.volatileData?.lastMove ??
        findLastMoveFromHistory(state, player.id);
      
      if (mode === "force_last_move" && lastMove) {
        return {
          overrideAction: { ...action.action, moveId: lastMove },
          events: [
            {
              type: "log",
              message: `${player.active.name} is locked into ${lastMove}!`,
            },
          ],
        };
      }
      if (mode === "force_specific" && data.moveId) {
        return {
          overrideAction: { ...action.action, moveId: data.moveId },
          events: [
            {
              type: "log",
              message: `${player.active.name} must use ${data.moveId}!`,
            },
          ],
        };
      }
      return {};
    },
  },
  disable_move: {
    onBeforeAction: ({ player, action, status }) => {
      const moveId = status?.data?.moveId;
      if (!moveId) return {};
      if (action?.action?.moveId === moveId) {
        return {
          preventAction: true,
          events: [
            {
              type: "log",
              message: `${player.active.name} cannot use ${moveId}!`, 
            },
          ],
        };
      }
      return {};
    },
  },
  encore: {
      onBeforeAction: ({ player, action, status }) => {
          const moveId = status?.data?.moveId;
          if (!moveId) return {};
          if (action?.action?.moveId !== moveId) {
              return {
                  overrideAction: { ...action.action, moveId },
                  events: [{ type: "log", message: `${player.active.name} received an encore!` }]
              };
          }
          return {};
      }
  },
  taunt: {
      onBeforeAction: ({ player, action, move }) => {
          if (move?.category === "status") {
              return {
                  preventAction: true,
                  events: [{ type: "log", message: `${player.active.name} can't use ${move.name} after the taunt!` }]
              };
          }
          return {};
      }
  },
  leech_seed: {
      onTurnEnd: ({ state, player, status }) => {
          const targetId = status.data?.sourceId; // The one who planted the seed
          if (!targetId) return {};
          const target = state.players.find(p => p.id === targetId)?.team?.[state.players.find(p => p.id === targetId).activeSlot];
          if (!target || target.hp <= 0) return {}; // Healer is gone
          
          const damage = Math.floor(player.active.maxHp / 8);
          return {
              events: [
                  { type: "log", message: `${player.active.name}'s health is sapped by Leech Seed!` },
                  { type: "damage", targetId: player.id, amount: Math.max(1, damage), meta: { from: "leech_seed" } },
                  { type: "damage", targetId: targetId, amount: -Math.max(1, damage), meta: { from: "leech_seed_heal" } }
              ]
          };
      }
  },
  curse: {
      onTurnEnd: ({ player }) => {
          const damage = Math.floor(player.active.maxHp / 4);
          return {
              events: [
                  { type: "log", message: `${player.active.name} is afflicted by the curse!` },
                  { type: "damage", targetId: player.id, amount: Math.max(1, damage), meta: { from: "curse" } }
              ]
          };
      }
  },
  yawn: {
      onTurnEnd: ({ state, player, status, rng }) => {
          let turns = status.data?.turns ?? 1;
          if (turns > 0) {
              status.data.turns = turns - 1;
              return { events: [{ type: "log", message: `${player.active.name} is getting drowsy...` }] };
          } else {
              // Sleep duration resolution
              const min = 2, max = 4;
              const duration = min + Math.floor((rng?.() ?? Math.random()) * (max - min + 1));
              
              return {
                  events: [
                      { type: "remove_status", targetId: player.id, statusId: "yawn" },
                      { type: "apply_status", targetId: player.id, statusId: "sleep", duration }
                  ]
              };
          }
      }
  },
  // Aliases or Specialized lock_move
  charging_solar_beam: {
      onBeforeAction: ({ player, action, status }) => {
          // Re-use lock_move logic or simplified
          // If status has data.mode = force_specific, it works like lock_move
          // We can just proxy to lock_move implementation logic if we extract it?
          // Or just copy-paste for clarity.
          
          const data = status.data ?? {};
          if (data.mode === "force_specific" && data.moveId) {
            return {
              overrideAction: { ...action.action, moveId: data.moveId },
              // No log needed every turn, or maybe "Solar Beam is charging..."?
              // Standard game just selects the move.
            };
          }
          return {};
      }
  },
  
  delayed_effect: {
      onTurnStart: handleDelayed,
      onTurnEnd: handleDelayed,
  },
  over_time_effect: {
      onTurnEnd: handleOverTime,
  },
};

function findLastMoveFromHistory(state, playerId) {
  const turns = state?.history?.turns;
  if (!turns?.length) return null;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const actions = turns[i]?.actions;
    if (!actions?.length) continue;
    for (let j = actions.length - 1; j >= 0; j -= 1) {
      const action = actions[j];
      if (action?.playerId === playerId && action?.moveId) {
        return action.moveId;
      }
    }
  }
  return null;
}

function getStatus(id) {
  return registry[id];
}

function runStatusHooks(state, playerId, hook, ctx = {}) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { state, events: [] };
  
  const active = getActiveCreature(state, playerId);
  if (!active) return { state, events: [] };
  
  // Proxy for backward compatibility in hook handlers
  const playerProxy = { ...player, active };

  let workingState = state;
  let allEvents = [];
  let preventAction = false;
  let overrideAction = null;
  let eventTransforms = [];

  const statuses = [...(active.statuses ?? [])]; // copy to safely iterate
  for (const status of statuses) {
    const impl = getStatus(status.id);
    if (impl?.[hook]) {
      const result = impl[hook]({ 
          state: workingState, 
          player: playerProxy, 
          status, 
          hook,
          ...ctx 
      }) || {};
      
      workingState = result.state ?? workingState;
      if (result.events) allEvents.push(...result.events);
      if (result.preventAction) preventAction = true;
      if (result.overrideAction) overrideAction = result.overrideAction;
      if (result.eventTransforms) eventTransforms.push(...result.eventTransforms);
    }
  }
  
  return {
    state: workingState,
    events: allEvents,
    preventAction,
    overrideAction,
    eventTransforms
  };
}

function runFieldHooks(state, hook, ctx = {}) {
    let workingState = state;
    const events = [];
    const eventTransforms = [];

    const runEffect = (effect, ownerId) => {
        const impl = getStatus(effect.id);
        const handler = impl?.[hook];
        if (!handler) return;
        const result = handler({
            state: workingState,
            fieldEffect: effect,
            ownerId,
            hook,
            ...ctx
        }) || {};
        if (result.state) workingState = result.state;
        if (result.events) events.push(...result.events);
        if (result.eventTransforms) eventTransforms.push(...result.eventTransforms);
    };

    if (workingState.field?.global) {
        workingState.field.global.forEach(e => runEffect(e, null));
    }
    // Implement sides later if needed
    
    return { state: workingState, events, eventTransforms };
}

function tickStatuses(state) {
  const next = structuredClone(state);
  for (const player of next.players) {
    const active = player.team[player.activeSlot];
    if (!active) continue;
    
    // Handle delayed effects trigger
    const delayed = active.statuses.find(s => s.id === "delayed_effect");
    if (delayed && delayed.data.triggerTurn === state.turn) {
         // This logic is actually handled by runStatusHooks("onTurnStart"|"onTurnEnd") calling handleDelayed
         // But we need to remove the status here if it triggered?
         // No, simpler: handleDelayed should return events, and we remove status if duration is done.
         // Wait, 'duration' handles removal automatically below.
    }

    if (active.statuses) {
        active.statuses.forEach(s => {
            if (s.remainingTurns !== null) {
                s.remainingTurns -= 1;
            }
        });
        active.statuses = active.statuses.filter(s => s.remainingTurns === null || s.remainingTurns > 0);
    }
  }
  return next;
}

function tickFieldEffects(state) {
    const next = structuredClone(state);
    if (next.field?.global) {
        next.field.global.forEach(e => {
            if (e.remainingTurns !== null) e.remainingTurns -= 1;
        });
        next.field.global = next.field.global.filter(e => e.remainingTurns === null || e.remainingTurns > 0);
    }
    return next;
}

function handleDelayed({ state, player, status, hook, rng }) {
  const timing = status.data?.timing ?? "turn_end";
  const triggerTurn = status.data?.triggerTurn ?? Infinity;
  if (!matchesTiming(hook, timing)) return {};
  if ((state.turn ?? 0) < triggerTurn) return {};
  
  const targetId = status.data?.targetId ?? player.id;
  const attackerId = status.data?.sourceId ?? player.id;
  
  const target = getActiveCreature(state, targetId);
  const attacker = getActiveCreature(state, attackerId);
  
  const baseCtx = {
    attacker,
    target,
    attackerPlayerId: attackerId,
    targetPlayerId: targetId,
    rng: rng ?? Math.random,
    turn: state.turn,
  };
  const newState = applyEffects(state, status.data?.effects ?? [], baseCtx);
  return { state: newState };
}

function handleOverTime({ state, player, status, hook, rng }) {
  const timing = status.data?.timing ?? "turn_end";
  if (!matchesTiming(hook, timing)) return {};
  
  const targetId = status.data?.targetId ?? player.id;
  const attackerId = status.data?.sourceId ?? player.id;
  
  const target = getActiveCreature(state, targetId);
  const attacker = getActiveCreature(state, attackerId);
  
  const baseCtx = {
    attacker,
    target,
    attackerPlayerId: attackerId,
    targetPlayerId: targetId,
    rng: rng ?? Math.random,
    turn: state.turn,
  };
  const newState = applyEffects(state, status.data?.effects ?? [], baseCtx);
  return { state: newState };
}

function matchesTiming(hook, timing) {
  if (!timing) return true;
  const t = timing.toLowerCase();
  if (t === "turn_start") return hook === "onTurnStart";
  if (t === "turn_end") return hook === "onTurnEnd";
  return true;
}

module.exports = {
  getStatus,
  runStatusHooks,
  runFieldHooks,
  tickStatuses,
  tickFieldEffects,
};
