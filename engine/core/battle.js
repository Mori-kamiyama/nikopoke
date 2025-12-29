const {
  applyEffect,
  applyEvents,
  hasItem,
  clearItemStatus,
  getItemId,
} = require("../effects");
const { applyEvent } = require("./events");
const { moves } = require("../data/moves");
const { stageMultiplier, isStatusMove, getActiveCreature } = require("./utils");
const {
  runAllAbilityHooks,
  applyAbilityEventModifiers,
  getWeather,
  runAbilityHooks,
  runAbilityValueHook,
  runAbilityCheckHook,
} = require("../abilities");
const {
  runStatusHooks,
  runFieldHooks,
  tickStatuses,
  tickFieldEffects,
} = require("../statuses");

/**
 * Execute one turn of battle.
 * @param {import("./state").BattleState} state
 * @param {{playerId: string, moveId?: string, targetId?: string, type?: "move"|"switch", slot?: number}[]} actions
 * @param {() => number} rng
 * @param {{recordHistory?: boolean}} options
 * @returns {import("./state").BattleState}
 */
function stepBattle(state, actions, rng = Math.random, options = {}) {
  const recordHistory = options.recordHistory !== false;
  let next = structuredClone(state);
  next.turn += 1;
  const logStart = next.log.length;
  const rngLog = [];
  const rngRecorder = () => {
    const v = rng();
    rngLog.push(v);
    return v;
  };
  next = applyEvent(next, { type: "log", message: `--- Turn ${next.turn} ---` });

  // 1. Turn Start Hooks (Ability -> Status -> Field)
  
  const abilityStart = runAllAbilityHooks(next, "onTurnStart", {
    rng: rngRecorder,
  });
  next = abilityStart.state;
  for (const ev of abilityStart.events) {
    next = applyEvent(next, ev);
  }
  for (const player of next.players) {
    const result = runStatusHooks(next, player.id, "onTurnStart", {
      rng: rngRecorder,
    });
    next = result.state;
    for (const ev of result.events) {
      next = applyEvent(next, ev);
    }
  }
  const fieldStart = runFieldHooks(next, "onTurnStart", { rng: rngRecorder });
  next = fieldStart.state;
  for (const ev of fieldStart.events) {
    next = applyEvent(next, ev);
  }

  // 2. Process Actions
  const ordered = [...actions]
    .map((a) => {
      if (a.type === "switch") {
         return {
             ...a,
             _priority: 10000, // Switches go first
             _speed: 0,
             _rand: rngRecorder(),
         };
      }
      
      const move = moves[a.moveId];
      const priority = getActionPriority(next, a, move);
      return {
        ...a,
        _priority: priority,
        _speed: creatureSpeed(next, a.playerId),
        _rand: rngRecorder(),
      };
    })
    .sort((a, b) => {
      if (b._priority !== a._priority) return b._priority - a._priority;
      if (b._speed !== a._speed) return b._speed - a._speed;
      return a._rand - b._rand;
    });

  for (const action of ordered) {
    const attacker = next.players.find((p) => p.id === action.playerId);
    
    // Switch Action
    if (action.type === "switch") {
       const active = getActiveCreature(next, action.playerId);
       if (active && active.hp > 0) {
         // Ghost types cannot be trapped
         const isGhost = Array.isArray(active.types) && active.types.includes("ghost");
         
         if (!isGhost) {
            const trapper = next.players.find(
              (p) =>
                p.id !== action.playerId &&
                runAbilityCheckHook(next, p.id, "onTrap", {
                  targetId: action.playerId,
                })
            );
            if (trapper) {
              next = applyEvent(next, {
                type: "log",
                message: `${attacker.name} couldn't switch out!`,
              });
              continue;
            }
         }
       }
       next = applyEvent(next, {
           type: "switch",
           playerId: action.playerId,
           slot: action.slot
       });
       
       const switchResult = runAbilityHooks(next, action.playerId, "onSwitchIn", { rng: rngRecorder });
       next = switchResult.state;
       for (const ev of switchResult.events) {
         next = applyEvent(next, ev);
       }
       continue;
    }

    // Item Action (Placeholder)
    if (action.type === "use_item") {
      const active = getActiveCreature(next, action.playerId);
      const canUse = runAbilityCheckHook(next, action.playerId, "onCheckItem", { action }, true);
      if (canUse === false) {
           next = applyEvent(next, {
               type: "log",
               message: `${attacker.name} cannot use items!`,
           });
           continue;
      }
      if (!active || !hasItem(active)) {
          next = applyEvent(next, {
              type: "log",
              message: `${attacker.name} has no item to use.`,
          });
          continue;
      }
      const itemId = getItemId(active);
      clearItemStatus(active);
      if (itemId && itemId.includes("berry")) {
          active.statuses.push({ id: "berry_consumed", remainingTurns: null, data: {} });
      }
      next = applyEvent(next, {
          type: "log",
          message: `${attacker.name} used its ${itemId ?? "item"}!`,
      });
      continue;
    }

    // Move Action
    const active = getActiveCreature(next, action.playerId);
    
    // Check and Reset Protect Counter if not using Protect
    const actionMove = moves[action.moveId];
    if (actionMove && actionMove.effects && !actionMove.effects.some(e => e.type === "protect")) {
         if (active && active.volatileData) {
             active.volatileData.protectSuccessCount = 0;
         }
    }

    if (!active || active.hp <= 0) {
      next = applyEvent(next, {
        type: "log",
        message: `Player ${action.playerId} cannot act.`,
      });
      continue;
    }

    const targetId =
      action.targetId ??
      next.players.find((p) => p.id !== action.playerId)?.id;
    const targetPlayer = next.players.find((p) => p.id === targetId);
    if (!targetPlayer) {
      next = applyEvent(next, {
        type: "log",
        message: `No valid target for ${action.playerId}.`,
      });
      continue;
    }
    const target = getActiveCreature(next, targetId);

    // Ability Before Action (Libero, etc)
    const abilityBefore = runAbilityHooks(next, attacker.id, "onBeforeAction", {
        target,
        action: { action },
        rng: rngRecorder,
        state: next
    });
    next = abilityBefore.state;
    for (const ev of abilityBefore.events) {
        next = applyEvent(next, ev);
    }
    if (abilityBefore.preventAction) continue;
    if (abilityBefore.overrideAction) Object.assign(action, abilityBefore.overrideAction);

    // Status Before Action
    const beforeAction = runStatusHooks(next, attacker.id, "onBeforeAction", {
      target,
      action: { action, status: null },
      move: moves[action.moveId], // Pass move data for Taunt etc.
      rng: rngRecorder,
    });
    next = beforeAction.state;
    for (const ev of beforeAction.events) {
      next = applyEvent(next, ev);
    }
    if (beforeAction.preventAction) {
      continue;
    }
    if (beforeAction.overrideAction) {
      Object.assign(action, beforeAction.overrideAction);
    }

    const fieldBefore = runFieldHooks(next, "onBeforeAction", {
      action,
      actorId: attacker.id,
      targetId,
      rng: rngRecorder,
    });
    next = fieldBefore.state;
    for (const ev of fieldBefore.events) {
      next = applyEvent(next, ev);
    }

    const attackerFresh = getActiveCreature(next, action.playerId);
    const targetFresh = getActiveCreature(next, targetId);
    if (!attackerFresh || !targetFresh) continue;
    if (attackerFresh.hp <= 0) continue;

    const move = moves[action.moveId];
    if (!move) {
      next = applyEvent(next, {
        type: "log",
        message: `Unknown move ${action.moveId}`,
      });
      continue;
    }

    if (!hasMovePp(attackerFresh, action.moveId, move)) {
      next = applyEvent(next, {
        type: "log",
        message: `${attackerFresh.name} has no PP left for ${move.name}!`,
      });
      continue;
    }
    consumeMovePp(attackerFresh, action.moveId, move);

    // Update lastMove in volatileData (for Encore/Disable)
    const currentAttacker = getActiveCreature(next, attacker.id);
    if (currentAttacker) {
        currentAttacker.volatileData = { 
            ...currentAttacker.volatileData, 
            lastMove: action.moveId 
        };
    }

    for (const effect of move.effects) {
      const effectEvents = applyEffect(next, effect, {
        attacker: getActiveCreature(next, attacker.id),
        target: getActiveCreature(next, targetId),
        move,
        attackerPlayerId: attacker.id,
        targetPlayerId: targetPlayer.id,
        rng: rngRecorder,
        turn: next.turn,
      });

      const abilityEvents = applyAbilityEventModifiers(next, effectEvents);
      const transforms = collectEventTransforms(next, abilityEvents, {
        attackerId: attacker.id,
        targetId,
        rng: rngRecorder,
      });
      const finalEvents = applyEventTransforms(abilityEvents, transforms);

      // Handle random_move inline
      const expandedEvents = [];
      for (const ev of finalEvents) {
        if (ev.type === "random_move") {
          const chosenMoveId = chooseRandomMove(
            next,
            ev.pool ?? "all",
            rngRecorder,
            attacker.id
          );
          if (!chosenMoveId) {
            expandedEvents.push({
              type: "log",
              message: `${attackerFresh.name} tried to use a random move but failed!`,
            });
            continue;
          }
          const chosenMove = moves[chosenMoveId];
          if (!chosenMove) continue;
          const attackerCurrent = getActiveCreature(next, attacker.id);
          if (!consumeMovePp(attackerCurrent, chosenMoveId, chosenMove)) {
            expandedEvents.push({
              type: "log",
              message: `${attackerFresh.name} has no PP left for ${chosenMove.name}!`,
            });
            continue;
          }
          expandedEvents.push({
            type: "log",
            message: `${attackerFresh.name} used ${chosenMove.name}! (random)`,
          });
          for (const subEffect of chosenMove.effects ?? []) {
            const subEvents = applyEffect(next, subEffect, {
              attacker: getActiveCreature(next, attacker.id),
              target: getActiveCreature(next, targetId),
              move: chosenMove,
              attackerPlayerId: attacker.id,
              targetPlayerId: targetPlayer.id,
              rng: rngRecorder,
              turn: next.turn,
            });
            expandedEvents.push(...subEvents);
          }
        } else {
          expandedEvents.push(ev);
        }
      }

      const finalTransforms = collectEventTransforms(next, expandedEvents, {
        attackerId: attacker.id,
        targetId,
        rng: rngRecorder,
      });
      const finalTransformed = applyEventTransforms(expandedEvents, finalTransforms);
      next = applyEvents(next, finalTransformed);
    }

    if (isBattleOver(next)) break;
  }

  // turn end hooks
  for (const player of next.players) {
    const result = runStatusHooks(next, player.id, "onTurnEnd", {
      rng: rngRecorder,
    });
    next = result.state;
    for (const ev of result.events) {
      next = applyEvent(next, ev);
    }
  }
  const abilityEnd = runAllAbilityHooks(next, "onTurnEnd", {
    rng: rngRecorder,
  });
  next = abilityEnd.state;
  for (const ev of abilityEnd.events) {
    next = applyEvent(next, ev);
  }
  const fieldEnd = runFieldHooks(next, "onTurnEnd", { rng: rngRecorder });
  next = fieldEnd.state;
  for (const ev of fieldEnd.events) {
    next = applyEvent(next, ev);
  }

  // tick durations
  next = tickStatuses(next);
  next = tickFieldEffects(next);

  // record turn history
  if (recordHistory) {
    const turnLog = next.log.slice(logStart);
    if (!next.history) next.history = { turns: [] };
    next.history.turns.push({
      turn: next.turn,
      actions: ordered.map((a) => ({
        playerId: a.playerId,
        type: a.type,
        moveId: a.moveId,
        targetId: a.targetId,
        slot: a.slot,
        priority: a._priority,
      })),
      log: turnLog,
      rng: rngLog,
    });
  }

  return next;
}

function creatureSpeed(state, playerId) {
  const creature = getActiveCreature(state, playerId);
  if (!creature) return 0;
  let speed = creature.speed * stageMultiplier(creature.stages.spe);
  
  // Use hook for Speed modifiers
  const weather = getWeather(state);
  speed = runAbilityValueHook(
      state, 
      playerId, 
      "onModifySpeed", 
      speed, 
      { weather, turn: state.turn }
  );

  return speed;
}

function isBattleOver(state) {
  for (const player of state.players) {
      const alive = player.team.some(c => c.hp > 0);
      if (!alive) return true;
  }
  return false;
}

function getActionPriority(state, action, move) {
  const base = action.priority ?? move?.priority ?? 0;
  
  // Use hook for Priority modifiers
  return runAbilityValueHook(
      state,
      action.playerId,
      "onModifyPriority",
      base,
      { move }
  );
}

function collectEventTransforms(state, events, ctx) {
  const transforms = [];
  for (const player of state.players) {
    const result = runStatusHooks(state, player.id, "onEventTransform", {
      events,
      rng: ctx.rng,
    });
    if (result.eventTransforms) transforms.push(...result.eventTransforms);
  }
  const fieldResult = runFieldHooks(state, "onEventTransform", {
    events,
    rng: ctx.rng,
  });
  if (fieldResult.eventTransforms) transforms.push(...fieldResult.eventTransforms);
  return transforms.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function applyEventTransforms(events, transforms) {
  if (!transforms || transforms.length === 0) return events;
  const result = [];
  for (const ev of events) {
    const cancel = transforms.find(
      (t) =>
        t.type === "cancel_event" &&
        (t.target === ev.type || t.targetType === ev.type || t.from === ev.type) &&
        (!t.targetId || t.targetId === ev.targetId)
    );
    if (cancel) continue;
    const replace = transforms.find(
      (t) =>
        t.type === "replace_event" &&
        (t.from === ev.type || t.targetType === ev.type) &&
        (!t.targetId || t.targetId === ev.targetId)
    );
    if (replace) {
      if (Array.isArray(replace.to)) {
        result.push(...replace.to);
      }
      continue;
    }
    result.push(ev);
  }
  return result;
}

function ensureMovePp(creature, moveId, moveDef) {
  if (!creature) return null;
  if (!creature.movePp) creature.movePp = {};
  if (creature.movePp[moveId] === undefined) {
    if (typeof moveDef?.pp === "number") {
      creature.movePp[moveId] = moveDef.pp;
    } else {
      creature.movePp[moveId] = null; // null means unlimited
    }
  }
  return creature.movePp[moveId];
}

function hasMovePp(creature, moveId, moveDef) {
  const remaining = ensureMovePp(creature, moveId, moveDef);
  if (remaining === null || remaining === undefined) return true;
  return remaining > 0;
}

function consumeMovePp(creature, moveId, moveDef) {
  const remaining = ensureMovePp(creature, moveId, moveDef);
  if (remaining === null || remaining === undefined) return true;
  if (remaining <= 0) return false;
  creature.movePp[moveId] = remaining - 1;
  return true;
}

function chooseRandomMove(state, pool, rng, attackerId) {
  const allMoveIds = Object.keys(moves);
  let candidates = allMoveIds;
  switch (pool) {
    case "self_moves": {
      // Use current active creature's moves if present
      const active = attackerId ? getActiveCreature(state, attackerId) : null;
      if (active?.moves?.length) candidates = active.moves;
      break;
    }
    case "physical":
      candidates = allMoveIds.filter(
        (id) => moves[id]?.category === "physical"
      );
      break;
    case "special":
      candidates = allMoveIds.filter((id) => moves[id]?.category === "special");
      break;
    case "status":
      candidates = allMoveIds.filter((id) => moves[id]?.category === "status");
      break;
    case "all":
    default:
      break;
  }
  const attacker = attackerId ? getActiveCreature(state, attackerId) : null;
  const filtered = candidates.filter((id) => {
    const def = moves[id];
    if (!def) return false;
    if (!attacker) return true;
    return hasMovePp(attacker, id, def);
  });
  if (!filtered.length) return null;
  const idx = Math.floor((rng?.() ?? Math.random()) * filtered.length);
  return filtered[idx];
}

module.exports = {
  stepBattle,
  isBattleOver,
};
