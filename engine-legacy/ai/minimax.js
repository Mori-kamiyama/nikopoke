const { stepBattle, isBattleOver } = require("../core/battle");
const { evaluateState } = require("./eval");
const { getActiveCreature } = require("../core/utils");

/**
 * Get available actions for a player.
 * @param {import("../core/state").BattleState} state 
 * @param {string} playerId 
 */
function getAvailableActions(state, playerId) {
    const player = state.players.find(p => p.id === playerId);
    const active = getActiveCreature(state, playerId);
    
    // If active pokemon is fainted or needs to switch, we MUST switch if possible
    if (!active || active.hp <= 0 || active.statuses.some(s => s.id === "pending_switch")) {
        const availableSwitches = player.team
            .map((p, i) => ({ p, i }))
            .filter(({ p, i }) => p.hp > 0 && i !== player.activeSlot) // Can switch to any alive pokemon NOT currently active
            .map(({ i }) => ({ type: "switch", playerId, slot: i }));
            
        if (availableSwitches.length > 0) return availableSwitches;
        // If no alive pokemon, we can't do anything (game over usually)
        if (!active || active.hp <= 0) return [{ type: "wait", playerId }];
        // If we need to switch but nobody else is alive, ignore the flag (shouldn't happen with correct engine logic)
    }

    const actions = [];
    
    // Moves
    if (active.moves) {
        for (const moveId of active.moves) {
             // Check PP
             if (active.movePp && active.movePp[moveId] === 0) continue;
             actions.push({ type: "move", playerId, moveId });
        }
    }
    
    // Switch
    const availableSwitches = player.team
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.hp > 0 && p !== active)
        .map(({ i }) => ({ type: "switch", playerId, slot: i }));
    actions.push(...availableSwitches);
    
    // If trapped, filter switches? 
    // Usually handled by engine, but for AI planning it's good to know.
    // For now, let engine fail the switch (AI learns it's bad via simulation result if handled properly)
    // But engine just logs "Can't switch" and wastes turn.
    // Ideally we filter here. But "trapped" status check is complex.
    
    return actions;
}

/**
 * 
 * @param {import("../core/state").BattleState} state 
 * @param {string} playerId 
 * @param {number} depth 
 */
function getBestMoveMinimax(state, playerId, depth = 2) {
    const opponentId = state.players.find(p => p.id !== playerId)?.id;
    if (!opponentId) return null;

    const myActions = getAvailableActions(state, playerId);
    const opActions = getAvailableActions(state, opponentId);
    
    let bestScore = -Infinity;
    let bestAction = myActions[0]; 
    
    // Recursive Maximin solver
    const solve = (currentState, currentDepth) => {
        if (currentDepth === 0 || isBattleOver(currentState)) {
            return evaluateState(currentState, playerId);
        }
        
        const myActs = getAvailableActions(currentState, playerId);
        const opActs = getAvailableActions(currentState, opponentId);
        
        if (myActs.length === 0 || opActs.length === 0) {
             return evaluateState(currentState, playerId);
        }

        let maxMinScore = -Infinity;
        
        for (const ma of myActs) {
            let minScore = Infinity;
            for (const oa of opActs) {
                // Fixed RNG to 0.5
                const nextState = stepBattle(currentState, [ma, oa], () => 0.5, { recordHistory: false });
                const score = solve(nextState, currentDepth - 1);
                if (score < minScore) minScore = score;
            }
            // Maximin: We want the action that gives the best worst-case scenario
            if (minScore > maxMinScore) maxMinScore = minScore;
        }
        return maxMinScore;
    };
    
    // Root Level
    for (const ma of myActions) {
        let minScore = Infinity;
        for (const oa of opActions) {
            const nextState = stepBattle(state, [ma, oa], () => 0.5, { recordHistory: false });
            const score = solve(nextState, depth - 1);
            if (score < minScore) minScore = score;
        }
        
        if (minScore > bestScore) {
            bestScore = minScore;
            bestAction = ma;
        }
    }
    
    return bestAction;
}

module.exports = { getBestMoveMinimax, getAvailableActions };
