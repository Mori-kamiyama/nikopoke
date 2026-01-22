const { runAutoBattle, chooseHighestPower } = require("./simple");
const { evaluateState } = require("./eval");
const { getAvailableActions } = require("./minimax"); 
const { stepBattle } = require("../core/battle");

/**
 * 
 * @param {import("../core/state").BattleState} state 
 * @param {string} playerId 
 * @param {number} simulations 
 */
function getBestMoveMCTS(state, playerId, simulations = 50) {
    const myActions = getAvailableActions(state, playerId);
    if (myActions.length === 0) return null;
    
    const opponentId = state.players.find(p => p.id !== playerId)?.id;
    if (!opponentId) return null; // Should not happen
    
    let bestAction = myActions[0];
    let bestAvgScore = -Infinity;
    
    const simsPerAction = Math.max(2, Math.floor(simulations / myActions.length));
    
    for (const action of myActions) {
        let totalScore = 0;
        
        for (let i = 0; i < simsPerAction; i++) {
            // Opponent chooses heuristically (highest power)
            const opAction = chooseHighestPower(state, opponentId) || { type: "wait", playerId: opponentId };
            
            // Random RNG for this simulation
            const rng = Math.random; 
            
            let nextState = stepBattle(state, [action, opAction], rng, { recordHistory: false });
            
            // Continue battle with simple AI for both sides
            const endState = runAutoBattle(nextState, rng, chooseHighestPower);
            
            totalScore += evaluateState(endState, playerId);
        }
        
        const avgScore = totalScore / simsPerAction;
        if (avgScore > bestAvgScore) {
            bestAvgScore = avgScore;
            bestAction = action;
        }
    }
    
    return bestAction;
}

module.exports = { getBestMoveMCTS };
