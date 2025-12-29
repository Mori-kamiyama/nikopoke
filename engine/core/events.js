/**
 * Event application helpers. Events are the only way the state is mutated.
 */

const { getActiveCreature } = require("./utils");

/**
 * @param {import("./state").BattleState} state
 * @param {Object} event
 * @param {string} event.type
 * @returns {import("./state").BattleState}
 */
function applyEvent(state, event) {
  const next = structuredClone(state);
  // Lazy require to avoid circular dependency
  const { runAbilityCheckHook, runAbilityValueHook } = require("../abilities");

  switch (event.type) {
    case "log": {
      if (event.message) {
        next.log.push(event.message);
      }
      return next;
    }
    case "switch": {
      const { playerId, slot } = event;
      const player = next.players.find((p) => p.id === playerId);
      if (!player) return next;
      
      const outgoing = player.team[player.activeSlot];
      const incoming = player.team[slot];
      
      if (outgoing) {
        // Reset volatile statuses and stages on switch out
        outgoing.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
        
        // Preserve non-volatile statuses
        const NON_VOLATILE = ["burn", "poison", "toxic", "paralysis", "sleep", "freeze"];
        outgoing.statuses = outgoing.statuses.filter(s => NON_VOLATILE.includes(s.id));
        
        outgoing.abilityData = {}; // Clear ability history flags
        outgoing.volatileData = {}; // Clear volatile data
        // Note: Primary status (poison, burn) persists.
      }
      
      player.activeSlot = slot;
      next.log.push(`${player.name} sent out ${incoming.name}!`);
      return next;
    }
    case "apply_status": {
      const { targetId, statusId, duration = null, stack = false, data } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;

      // Check immunity via abilities
      if (runAbilityCheckHook(next, targetId, "onCheckStatusImmunity", { statusId })) {
        next.log.push(`${target.name} is immune to ${statusId}.`);
        return next;
      }

      const existing = target.statuses.find((s) => s.id === statusId);
      if (existing && !stack) {
        next.log.push(`${target.name} already has ${statusId}.`);
        return next;
      }
      target.statuses.push({
        id: statusId,
        remainingTurns: duration,
        data: data ?? {},
      });
      next.log.push(`${target.name} is now ${statusId}.`);
      return next;
    }
    case "remove_status": {
      const { targetId, statusId } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;
      const before = target.statuses.length;
      target.statuses = target.statuses.filter(
        (s) => s.id !== statusId
      );
      if (before !== target.statuses.length) {
        next.log.push(`${target.name} is no longer ${statusId}.`);
      }
      return next;
    }
    case "cure_all_status": {
      const { targetId } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;
      if (target.statuses.length > 0) {
        target.statuses = [];
        next.log.push(`${target.name}'s statuses were cured.`);
      }
      return next;
    }
    case "replace_status": {
      const { targetId, from, to, duration = null, data } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;
      const hadFrom = target.statuses.some((s) => s.id === from);
      if (!hadFrom) return next;
      target.statuses = target.statuses.filter(
        (s) => s.id !== from
      );
      target.statuses.push({
        id: to,
        remainingTurns: duration,
        data: data ?? {},
      });
      next.log.push(`${target.name}'s ${from} changed to ${to}.`);
      return next;
    }
    case "apply_field_status": {
      const { statusId, duration = null, stack = false, data } = event;
      if (!next.field) next.field = { global: [], sides: {} };
      if (!next.field.global) next.field.global = [];
      const existingIndex = next.field.global.findIndex((s) => s.id === statusId);
      if (existingIndex >= 0 && !stack) {
        next.field.global[existingIndex] = {
          id: statusId,
          remainingTurns: duration,
          data: data ?? {},
        };
        return next;
      }
      next.field.global.push({
        id: statusId,
        remainingTurns: duration,
        data: data ?? {},
      });
      return next;
    }
    case "remove_field_status": {
      const { statusId } = event;
      if (!next.field?.global) return next;
      next.field.global = next.field.global.filter((s) => s.id !== statusId);
      return next;
    }
    case "random_move": {
      // No direct state mutation; handled at battle step level.
      return next;
    }
    case "modify_stage": {
      const {
        targetId,
        stages,
        clamp = true,
        failIfNoChange = false,
        showEvent = true,
      } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;
      
      // Ability hook for stages (Contrary, Simple)
      // We pass stages as 'value' AND 'stages' in context to support both patterns
      const adjusted = runAbilityValueHook(
          next, 
          targetId, 
          "onModifyStage", 
          stages ?? {}, 
          { stages: stages ?? {} }
      );

      const c = target;
      const before = { ...c.stages };
      for (const [key, delta] of Object.entries(adjusted)) {
        const prev = c.stages[key] ?? 0;
        let nextStage = prev + delta;
        if (clamp) nextStage = Math.max(-6, Math.min(6, nextStage));
        c.stages[key] = nextStage;
      }
      const changed = Object.keys(adjusted).some(
        (key) => before[key] !== c.stages[key]
      );
      if (!changed && failIfNoChange) {
        next.log.push(`${c.name}'s stats did not change.`);
        return next;
      }
      if (changed && showEvent) {
        next.log.push(
          `${c.name}'s stages: ${formatStages(before)} -> ${formatStages(
            c.stages
          )}`
        );
      }
      return next;
    }
    case "clear_stages": {
      const { targetId, showEvent = true } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;
      const before = { ...target.stages };
      target.stages = {
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
        acc: 0,
        eva: 0,
      };
      if (showEvent) {
        next.log.push(
          `${target.name}'s stages were cleared (${formatStages(
            before
          )} -> ${formatStages(target.stages)}).`
        );
      }
      return next;
    }
    case "reset_stages": {
      const { targetId, showEvent = true } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;
      const before = { ...target.stages };
      target.stages = {
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
        acc: 0,
        eva: 0,
      };
      if (showEvent) {
        next.log.push(
          `${target.name}'s stages were reset (${formatStages(
            before
          )} -> ${formatStages(target.stages)}).`
        );
      }
      return next;
    }
    case "damage": {
      const { targetId, amount } = event;
      const target = getActiveCreature(next, targetId);
      if (!target) return next;
      const before = target.hp;
      const after = Math.max(0, before - amount);
      target.hp = after;
      next.log.push(
        `${target.name} took ${amount} damage (${before} -> ${after})`
      );
      if (after === 0) {
        next.log.push(`${target.name} fainted!`);
        const owner = next.players.find((p) => p.id === targetId);
        if (owner) {
            owner.lastFaintedAbility = target.ability;
            if (!target.statuses.some(s => s.id === "pending_switch")) {
                target.statuses.push({ id: "pending_switch", remainingTurns: null, data: {} });
            }
        }
      }
      return next;
    }
    case "self_switch":
    case "force_switch": {
      const { targetId } = event;
      const target = getActiveCreature(next, targetId);
      if (target) {
        if (!target.statuses.some(s => s.id === "pending_switch")) {
            target.statuses.push({ id: "pending_switch", remainingTurns: null, data: {} });
        }
      }
      return next;
    }
    default:
      return next;
  }
}

function formatStages(stages) {
  return `atk ${stages.atk ?? 0}, def ${stages.def ?? 0}, spa ${
    stages.spa ?? 0
  }, spd ${stages.spd ?? 0}, spe ${stages.spe ?? 0}`;
}

module.exports = { applyEvent };
