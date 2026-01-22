const { runAutoBattle, chooseHighestPower } = require("./simple");
const { getBestMoveMinimax } = require("./minimax");
const { getBestMoveMCTS } = require("./mcts");
const { evaluateState } = require("./eval");

module.exports = {
  runAutoBattle,
  chooseHighestPower,
  getBestMoveMinimax,
  getBestMoveMCTS,
  evaluateState
};
