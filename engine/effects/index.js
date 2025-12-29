const { applyEvent } = require("../core/events");
const { getTypeEffectiveness } = require("../data/type_chart");
const { stageMultiplier } = require("../core/utils");
const { runAbilityValueHook, runAbilityCheckHook, getWeather } = require("../abilities");

/**
 * Build events for a given effect.
 * Returns an array of BattleEvent (not yet applied).
 */
function applyEffect(state, effect, ctx) {
  const ctxWithTurn = { ...ctx, turn: ctx.turn ?? state.turn ?? 0 };
  const events = [];
  switch (effect.type) {
    case "protect": {
        const attackerCreature = currentCreature(state, ctxWithTurn.attackerPlayerId);
        if (!attackerCreature) return [];
        
        // Success chance depends on consecutive uses
        // We use volatileData.protectSuccessCount for tracking
        const successCount = attackerCreature.volatileData?.protectSuccessCount ?? 0;
        
        let chance = 1.0;
        for(let i=0; i<successCount; i++) chance *= 0.5; // Simple halving
        
        if (ctx.rng() > chance) {
             events.push({
                 type: "log",
                 message: `${ctx.attacker.name}'s protect failed!`,
             });
             attackerCreature.volatileData.protectSuccessCount = 0;
             return events;
        }

        // Increment counter
        attackerCreature.volatileData.protectSuccessCount = successCount + 1;

        // Apply status protect
        events.push({
            type: "apply_status",
            statusId: "protect",
            targetId: ctx.attackerPlayerId,
            duration: 1, // Current turn only
            meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        
        return events;
    }
    case "damage": {
      const attackerCreature = currentCreature(
        state,
        ctxWithTurn.attackerPlayerId
      );
      const targetCreature = currentCreature(
        state,
        ctxWithTurn.targetPlayerId
      );
      const category = getMoveCategory(ctx.move);
      let accuracy = effect.accuracy ?? 1;

      // Accuracy modifiers from abilities
      accuracy = runAbilityValueHook(
          state, 
          ctxWithTurn.attackerPlayerId, 
          "onModifyAccuracy", 
          accuracy, 
          { 
              move: ctx.move, 
              category, 
              target: targetCreature 
          }
      );

      if (ctx.rng() > accuracy) {
        events.push({
          type: "log",
          message: `${ctx.attacker.name}'s ${ctx.move.name} missed!`,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        return events;
      }

      const amount = calcDamage(
        effect.power,
        attackerCreature,
        targetCreature,
        ctx.rng,
        state,
        ctxWithTurn
      );
      const attackerName = ctx.attacker?.name ?? "Unknown";
      const moveName = ctx.move?.name ?? effect.name ?? "move";
      events.push({
        type: "log",
        message: `${attackerName} used ${moveName}!`,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      events.push({
        type: "damage",
        targetId: ctx.targetPlayerId,
        amount,
        meta: {
          source: ctx.attackerPlayerId,
          target: ctx.targetPlayerId,
          moveId: ctx.move?.id,
          cancellable: true,
        },
      });
      if (attackerCreature?.ability === "parental_bond") {
        const secondPower = (effect.power ?? 0) * 0.25;
        const secondAmount = calcDamage(
          secondPower,
          attackerCreature,
          targetCreature,
          ctx.rng,
          state,
          { ...ctxWithTurn, parentalBondHit: true }
        );
        events.push({
          type: "damage",
          targetId: ctx.targetPlayerId,
          amount: secondAmount,
          meta: {
            source: ctx.attackerPlayerId,
            target: ctx.targetPlayerId,
            moveId: ctx.move?.id,
            parentalBond: true,
            cancellable: true,
          },
        });
      }
      return events;
    }
    case "speed_based_damage": {
      const attackerSpeed = computeSpeed(state, ctxWithTurn.attackerPlayerId, ctxWithTurn.turn);
      const targetSpeed = computeSpeed(state, ctxWithTurn.targetPlayerId, ctxWithTurn.turn);
      const ratio = targetSpeed <= 0 ? Infinity : attackerSpeed / targetSpeed;

      const thresholds = [...(effect.thresholds ?? [])].sort(
        (a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)
      );
      let chosenPower =
        effect.basePower ??
        (thresholds.length > 0 ? thresholds[thresholds.length - 1].power ?? 0 : 0);
      for (const t of thresholds) {
        if (ratio >= (t.ratio ?? 0)) {
          chosenPower = t.power ?? chosenPower;
          break;
        }
      }

      const damageEffect = {
        type: "damage",
        power: chosenPower,
        accuracy: effect.accuracy ?? 1.0,
      };
      return applyEffect(state, damageEffect, ctx);
    }
    case "apply_status": {
      if (isItemStatus(effect.statusId)) {
        const targetId = resolveTarget(effect.target, ctx);
        const target = currentCreature(state, targetId);
        if (!target) return [];
        const itemId = effect.data?.itemId ?? effect.statusId;
        setItemStatus(target, itemId);
        const giver = ctx.attacker?.name ?? "Someone";
        events.push({
          type: "log",
          message: `${giver} gave ${itemId} to ${target.name}.`,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        return events;
      }

      if (!passesChance(effect, ctx.rng)) {
        events.push({
          type: "log",
          message: `${ctx.attacker.name}'s ${effect.statusId} failed to apply.`,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        return events;
      }
      const targetId = resolveTarget(effect.target, ctx);
      
      let duration = effect.duration ?? null;
      if (typeof duration === 'object' && duration !== null && 'min' in duration && 'max' in duration) {
          const range = duration.max - duration.min + 1;
          duration = duration.min + Math.floor(ctx.rng() * range);
      }
      
      const data = { ...effect.data };
      if (data.sourceId === "self") {
          data.sourceId = ctx.attackerPlayerId;
      }

      events.push({
        type: "apply_status",
        statusId: effect.statusId,
        targetId,
        duration: duration,
        stack: effect.stack ?? false,
        data: data,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "ohko": {
      const attacker = currentCreature(state, ctxWithTurn.attackerPlayerId);
      const target = currentCreature(state, ctxWithTurn.targetPlayerId);
      if (!attacker || !target) return [];

      if ((effect.respectTypeImmunity ?? true) && ctx.move?.type) {
        const eff = getTypeEffectiveness(ctx.move.type, target.types);
        if (eff === 0) {
          events.push({
            type: "log",
            message: `${ctx.move?.name ?? "The move"} doesn't affect ${target.name}!`,
            meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
          });
          return events;
        }
      }

      if (Array.isArray(effect.immuneTypes)) {
        const blocked = target.types?.some((t) => effect.immuneTypes.includes(t));
        if (blocked) {
          events.push({
            type: "log",
            message: `${ctx.move?.name ?? "The move"} doesn't affect ${target.name}!`,
            meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
          });
          return events;
        }
      }

      const attackerLevel = attacker.level ?? 1;
      const targetLevel = target.level ?? 1;
      if (effect.failIfTargetHigherLevel !== false && attackerLevel < targetLevel) {
        events.push({
          type: "log",
          message: `${ctx.move?.name ?? "The move"} failed against the higher-level target.`,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        return events;
      }

      const baseAccuracy =
        effect.requiredType &&
        !attacker.types?.includes(effect.requiredType) &&
        effect.nonMatchingTypeAccuracy != null
          ? effect.nonMatchingTypeAccuracy
          : effect.baseAccuracy ?? 0.3;

      let accuracy = baseAccuracy;
      if (effect.levelScaling !== false) {
        accuracy += (attackerLevel - targetLevel) / 100;
      }
      accuracy = Math.max(0, Math.min(1, accuracy));

      const category = getMoveCategory(ctx.move);
      accuracy = runAbilityValueHook(
        state,
        ctxWithTurn.attackerPlayerId,
        "onModifyAccuracy",
        accuracy,
        { move: ctx.move, category, target }
      );

      if (ctx.rng() > accuracy) {
        events.push({
          type: "log",
          message: `${attacker.name}'s ${ctx.move?.name ?? "OHKO move"} missed!`,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        return events;
      }

      const amount = target.hp;
      events.push({
        type: "log",
        message: `${attacker.name} used ${ctx.move?.name ?? "an OHKO move"}!`,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      events.push({
        type: "damage",
        targetId: ctx.targetPlayerId,
        amount,
        meta: {
          source: ctx.attackerPlayerId,
          target: ctx.targetPlayerId,
          moveId: ctx.move?.id,
          ohko: true,
          cancellable: true,
        },
      });
      return events;
    }
    case "apply_field_status": {
      const duration = effect.duration ?? null;
      events.push({
        type: "apply_field_status",
        statusId: effect.statusId,
        duration,
        stack: effect.stack ?? false,
        data: effect.data ?? {},
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "remove_status": {
      const targetId = resolveTarget(effect.target, ctx);
      if (isItemStatus(effect.statusId)) {
        const target = currentCreature(state, targetId);
        if (!target) return [];
        clearItemStatus(target);
        const remover = ctx.attacker?.name ?? "Someone";
        events.push({
          type: "log",
          message: `${remover} removed the held item from ${target.name}.`,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        return events;
      }
      events.push({
        type: "remove_status",
        statusId: effect.statusId,
        targetId,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "remove_field_status": {
      events.push({
        type: "remove_field_status",
        statusId: effect.statusId,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "log": {
      if (effect.message) {
        events.push({
          type: "log",
          message: effect.message,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
      }
      return events;
    }
    case "cure_all_status": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "cure_all_status",
        targetId,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "replace_status": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "replace_status",
        targetId,
        from: effect.from,
        to: effect.to,
        duration: effect.duration ?? null,
        data: effect.data,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "modify_stage": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "modify_stage",
        targetId,
        stages: effect.stages ?? {},
        clamp: effect.clamp ?? true,
        failIfNoChange: effect.fail_if_no_change ?? false,
        showEvent: effect.show_event ?? true,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "clear_stages": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "clear_stages",
        targetId,
        showEvent: effect.show_event ?? true,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "reset_stages": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "reset_stages",
        targetId,
        showEvent: effect.show_event ?? true,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "disable_move": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "apply_status",
        statusId: "disable_move",
        targetId,
        duration: effect.duration ?? null,
        data: { moveId: effect.moveId },
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "chance": {
      const roll = ctx.rng();
      if (roll <= (effect.p ?? 0)) {
        return applyEffects(state, effect.then ?? [], ctx, true);
      }
      if (effect.else) {
        return applyEffects(state, effect.else, ctx, true);
      }
      return [];
    }
    case "repeat": {
      // Resolve repeat count
      let times = effect.times ?? effect.count ?? 1;
      
      // Handle random range { min, max }
      if (typeof times === 'object' && times !== null && 'min' in times && 'max' in times) {
          // Check for Skill Link ability
          const isSkillLink = runAbilityCheckHook(state, ctx.attackerPlayerId, "onSkillLink", {});
          // console.log(`Skill Link check for ${ctx.attackerPlayerId}: ${isSkillLink}`);
          
          if (isSkillLink) {
              times = times.max;
          } else {
              const range = times.max - times.min + 1;
              // Weighted distribution for multi-hit moves usually? 
              // 2 hits: 35%, 3 hits: 35%, 4 hits: 15%, 5 hits: 15% (for 2-5 range)
              // But for generic min-max, linear is simpler for now unless specified.
              // Let's implement standard 2-5 weighted if min=2 max=5?
              // Or simple linear for now to keep DSL generic.
              // Let's stick to simple uniform random for generic DSL unless specific logic requested.
              times = times.min + Math.floor(ctx.rng() * range);
          }
      }

      let collected = [];
      for (let i = 0; i < times; i += 1) {
        collected = collected.concat(applyEffects(state, effect.effects ?? [], ctx, true));
      }
      
      if (times > 1) {
          collected.push({ type: "log", message: `Hit ${times} time(s)!` });
      }
      
      return collected;
    }
    case "conditional": {
      const cond = effect.if ?? {};
      const outcome = evaluateCondition(state, cond, ctxWithTurn)
        ? effect.then
        : effect.else;
      if (!outcome) return [];
      return applyEffects(state, outcome, ctx, true);
    }
    case "damage_ratio": {
      const targetId = resolveTarget(effect.target, ctx);
      const target = currentCreature(state, targetId, "def");
      if (!target) return [];
      const amount = Math.max(
        1,
        Math.floor(target.maxHp * (effect.ratioMaxHp ?? 0))
      );
      events.push({
        type: "damage",
        targetId,
        amount,
        meta: {
          source: ctx.attackerPlayerId,
          target: targetId,
          moveId: ctx.move?.id,
          cancellable: true,
        },
      });
      return events;
    }
    case "delay": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "apply_status",
        statusId: "delayed_effect",
        targetId,
        duration: (effect.afterTurns ?? 0) + 1,
        data: {
          triggerTurn: (ctxWithTurn.turn ?? 0) + (effect.afterTurns ?? 0),
          effects: effect.effects ?? [],
          sourceId: ctx.attackerPlayerId,
          targetId,
          timing: effect.timing ?? "turn_end",
        },
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "over_time": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "apply_status",
        statusId: "over_time_effect",
        targetId,
        duration: effect.duration ?? null,
        data: {
          effects: effect.effects ?? [],
          timing: effect.timing ?? "turn_end",
          sourceId: ctx.attackerPlayerId,
          targetId,
        },
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "random_move": {
      events.push({
        type: "random_move",
        pool: effect.pool ?? "all",
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "apply_item": {
      const targetId = resolveTarget(effect.target, ctx);
      const target = currentCreature(state, targetId);
      if (!target) return [];
      const itemId = effect.itemId ?? "item";
      setItemStatus(target, itemId);
      events.push({
        type: "log",
        message: `${target.name} received ${itemId}.`,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "remove_item": {
      const targetId = resolveTarget(effect.target, ctx);
      const target = currentCreature(state, targetId);
      if (!target) return [];
      const hadItem = hasItem(target);
      clearItemStatus(target);
      events.push({
        type: "log",
        message: hadItem ? `${target.name}'s item was removed!` : `${target.name} has no item.`,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "consume_item": {
      const targetId = resolveTarget(effect.target, ctx);
      const target = currentCreature(state, targetId);
      if (!target) return [];
      if (!hasItem(target)) {
        events.push({
          type: "log",
          message: `${target.name} has no item to consume.`,
          meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
        });
        return events;
      }
      const itemId = getItemId(target);
      clearItemStatus(target);
      if (effect.markBerryConsumed || (itemId && itemId.includes("berry"))) {
        target.statuses.push({
          id: "berry_consumed",
          remainingTurns: null,
          data: {},
        });
      }
      events.push({
        type: "log",
        message: `${target.name} consumed its ${itemId ?? "item"}!`,
        meta: { moveId: ctx.move?.id, source: ctx.attackerPlayerId },
      });
      return events;
    }
    case "self_switch": {
      events.push({
        type: "self_switch",
        targetId: ctx.attackerPlayerId,
      });
      return events;
    }
    case "force_switch": {
      const targetId = resolveTarget(effect.target, ctx);
      events.push({
        type: "force_switch",
        targetId,
      });
      return events;
    }
    default:
      return [];
  }
}

/**
 * Apply a list of effects to state and return new state.
 * If returnEvents=true, returns just the built events.
 */
function applyEffects(state, effects, ctx, returnEvents = false) {
  let events = [];
  for (const eff of effects) {
    events = events.concat(applyEffect(state, eff, ctx));
  }
  if (returnEvents) return events;
  return applyEvents(state, events);
}

function applyEvents(state, events) {
  let next = state;
  for (const ev of events) {
    next = applyEvent(next, ev);
  }
  return next;
}

function calcDamage(power, attacker, target, rng, state, ctx = {}) {
  if (!attacker || !target) return 0;
  const category = getMoveCategory(ctx.move);
  const movePower = modifyMovePower(power ?? 0, state, attacker, target, ctx);
  const level = attacker.level ?? 50;
  const crit = rollCritical(state, attacker, target, ctx, rng);
  const stab = attacker.types?.includes(ctx.move?.type) ? 1.5 : 1;
  const typeEffectiveness = getTypeEffectiveness(ctx.move?.type, target.types);
  if (typeEffectiveness === 0) return 0;
  const { atk, def } = resolveOffenseDefense(state, attacker, target, category, {
    ...ctx,
    isCritical: crit,
  });
  const base =
    (((level * 2) / 5 + 2) * movePower * atk) / def / 50 + 2;
  const [minRand, maxRand] = randomRange();
  const roll = minRand + (maxRand - minRand) * rng();
  const raw = base * roll * (crit ? 1.5 : 1) * stab * typeEffectiveness;
  return Math.max(1, Math.floor(raw));
}



function randomRange() {
  return [0.85, 1];
}

function computeSpeed(state, playerId, turn = 0) {
  const creature = currentCreature(state, playerId);
  if (!creature) return 0;

  const stage = creature.stages?.spe ?? 0;
  let speed = (creature.speed ?? 0) * stageMultiplier(stage);

  const weather = getWeather(state);
  speed = runAbilityValueHook(state, playerId, "onModifySpeed", speed, {
    weather,
    turn,
  });

  return speed;
}

function modifyMovePower(basePower, state, attacker, target, ctx) {
  // Use hook for power modifiers (Sharpness, Technician, Steelworker, Hustle, Pure Power, Guts)
  let power = runAbilityValueHook(
      state,
      ctx.attackerPlayerId,
      "onModifyPower",
      basePower,
      { 
          move: ctx.move, 
          category: getMoveCategory(ctx.move), 
          target 
      }
  );

  // Use hook for defensive power modifiers (Thick Fat, Heatproof, Dry Skin, Fluffy)
  if (ctx.targetPlayerId) {
      power = runAbilityValueHook(
          state,
          ctx.targetPlayerId,
          "onDefensivePower",
          power,
          {
              move: ctx.move,
              category: getMoveCategory(ctx.move),
              attacker
          }
      );
  }

  return power;
}

function resolveOffenseDefense(state, attacker, target, category, ctx) {
  const offenseKey = category === "special" ? "spAttack" : "attack";
  const defenseKey = category === "special" ? "spDefense" : "defense";
  const offenseStageKey = category === "special" ? "spa" : "atk";
  const defenseStageKey = category === "special" ? "spd" : "def";
  let atkStage = attacker.stages?.[offenseStageKey] ?? 0;
  let defStage = target.stages?.[defenseStageKey] ?? 0;

  if (attacker.ability === "unaware") {
    defStage = 0;
  }
  if (target.ability === "unaware") {
    atkStage = 0;
  }

  if (ctx?.isCritical) {
    atkStage = Math.max(0, atkStage);
    defStage = Math.min(0, defStage);
  }

  let atk = (attacker[offenseKey] ?? 0) * stageMultiplier(atkStage);
  let def = Math.max(1, (target[defenseKey] ?? 1) * stageMultiplier(defStage));

  // Hook for Offense (Slow Start, etc.)
  atk = runAbilityValueHook(
      state,
      ctx.attackerPlayerId,
      "onModifyOffense",
      atk,
      { category, turn: ctx.turn }
  );

  // Hook for Defense (Fur Coat, etc.)
  def = runAbilityValueHook(
      state,
      ctx.targetPlayerId,
      "onModifyDefense",
      def,
      { category, turn: ctx.turn }
  );

  return { atk, def };
}

function rollCritical(state, attacker, target, ctx, rng) {
  if (ctx?.parentalBondHit) return false;

  let critStage = 0;
  if (ctx?.move?.critRate) critStage += ctx.move.critRate;
  
  // Hook for Crit Chance (Super Luck, Merciless)
  critStage = runAbilityValueHook(
      state,
      ctx.attackerPlayerId,
      "onModifyCritChance",
      critStage,
      { target }
  );

  if (critStage <= 0) return false;
  // If Merciless returns 999, chance is > 1.
  const chance = critStage === 1 ? 0.125 : critStage === 2 ? 0.5 : 1;
  const roll = rng();
  const isCrit = chance >= 1 ? true : roll < chance;
  if (isCrit) ctx.isCritical = true;
  return isCrit;
}

function getMoveCategory(move) {
  if (move?.category) return move.category;
  const hasDamage = (move?.effects ?? []).some((e) => e.type === "damage");
  return hasDamage ? "physical" : "status";
}

function evaluateCondition(state, cond, ctx) {
  switch (cond.type) {
    case "target_has_status": {
      const target = currentCreature(state, ctx.targetPlayerId, "def");
      if (isItemStatus(cond.statusId) && hasItem(target)) return true;
      return !!target?.statuses?.some((s) => s.id === cond.statusId);
    }
    case "target_hp_lt": {
      const target = currentCreature(state, ctx.targetPlayerId, "def");
      if (!target) return false;
      const ratio = target.hp / target.maxHp;
      return ratio < (cond.value ?? 0);
    }
    case "field_has_status": {
      return (
        state.field?.global?.some((e) => e.id === cond.statusId) ?? false
      );
    }
    case "weather_is_sunny":
      return fieldHasAnyStatus(state, [
        "sunny_weather",
        "sunny_day",
        "sun",
      ]);
    case "weather_is_raining":
      return fieldHasAnyStatus(state, [
        "rain",
        "rainy_weather",
        "rain_dance",
      ]);
    case "weather_is_hail":
      return fieldHasAnyStatus(state, ["hail", "hail_weather", "snow"]);
    case "weather_is_sandstorm":
      return fieldHasAnyStatus(state, ["sandstorm", "sandstorm_weather"]);
    case "user_type": {
        // ctx.attacker is a copy, might not be fully populated with types if passed from some contexts?
        // But assuming ctx.attacker is set.
        return ctx.attacker?.types?.includes(cond.typeId) ?? false;
    }
    case "user_has_status": {
        const attacker = currentCreature(state, ctx.attackerPlayerId);
        return !!attacker?.statuses?.some((s) => s.id === cond.statusId);
    }
    case "target_has_item": {
      const target = currentCreature(state, ctx.targetPlayerId, "def");
      return hasItem(target);
    }
    case "user_has_item": {
      const attacker = currentCreature(state, ctx.attackerPlayerId);
      return hasItem(attacker);
    }
    default:
      return false;
  }
}

function currentCreature(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  return player.team[player.activeSlot];
}

function fieldHasAnyStatus(state, ids) {
  if (!state.field?.global) return false;
  return state.field.global.some((e) => ids.includes(e.id));
}

function passesChance(effect, rng) {
  if (effect.chance == null) return true;
  return rng() <= effect.chance;
}

function resolveTarget(target, ctx) {
  switch (target) {
    case "self":
      return ctx.attackerPlayerId;
    case "all":
    case "target":
    default:
      return ctx.targetPlayerId;
  }
}

function isItemStatus(statusId) {
  return statusId === "item" || statusId === "berry";
}

function hasItem(creature) {
  if (!creature) return false;
  if (creature.item) return true;
  return creature.statuses?.some((s) => s.id === "item" || s.id === "berry");
}

function getItemId(creature) {
  if (!creature) return null;
  if (creature.item) return creature.item;
  const status = creature.statuses?.find(
    (s) => s.id === "item" || s.id === "berry"
  );
  return status?.data?.itemId ?? status?.id ?? null;
}

function setItemStatus(creature, itemId) {
  if (!creature) return;
  creature.item = itemId;
  const existingIndex = creature.statuses?.findIndex(
    (s) => s.id === "item" || s.id === "berry"
  );
  const statusObj = { id: "item", remainingTurns: null, data: { itemId } };
  if (existingIndex != null && existingIndex >= 0) {
    creature.statuses[existingIndex] = statusObj;
  } else {
    creature.statuses = [...(creature.statuses ?? []), statusObj];
  }
}

function clearItemStatus(creature) {
  if (!creature) return;
  creature.item = null;
  creature.statuses = (creature.statuses ?? []).filter(
    (s) => s.id !== "item" && s.id !== "berry"
  );
}

module.exports = {
  applyEffect,
  applyEffects,
  applyEvents,
  hasItem,
  setItemStatus,
  clearItemStatus,
  getItemId,
};
