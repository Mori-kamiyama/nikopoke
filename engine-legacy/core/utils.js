function stageMultiplier(stage) {
  const s = Math.max(-6, Math.min(6, stage ?? 0));
  if (s >= 0) return (2 + s) / 2;
  return 2 / (2 - s);
}

function isStatusMove(move) {
  if (move?.category) return move.category === "status";
  const hasDamage = (move?.effects ?? []).some((e) => e.type === "damage");
  return !hasDamage;
}

function isReflectableStatusEvent(type) {
  return (
    type === "apply_status" ||
    type === "remove_status" ||
    type === "replace_status" ||
    type === "modify_stage" ||
    type === "clear_stages" ||
    type === "reset_stages" ||
    type === "disable_move" ||
    type === "cure_all_status"
  );
}

function getActiveCreature(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  // Fallback to active property if team structure is not fully migrated in some contexts, 
  // but we enforce team[activeSlot] now.
  if (player.team && typeof player.activeSlot === 'number') {
      return player.team[player.activeSlot];
  }
  return player.active; // Backward compatibility just in case
}

module.exports = {
  stageMultiplier,
  isStatusMove,
  isReflectableStatusEvent,
  getActiveCreature,
};