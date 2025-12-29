const { createBattleState } = require("./core/state");
const { stepBattle, isBattleOver } = require("./core/battle");
const { replayBattle } = require("./core/replay");
const {
  runAutoBattle,
  chooseHighestPower,
  getBestMoveMinimax,
  getBestMoveMCTS,
} = require("./ai");

module.exports = {
  createBattleState,
  stepBattle,
  isBattleOver,
  replayBattle,
  runAutoBattle,
  chooseHighestPower,
  getBestMoveMinimax,
  getBestMoveMCTS,
};
