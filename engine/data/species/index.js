// data/species/index.js
const gen1 = require("./gen1");

module.exports = {
  species: {
    ...gen1,
    // 他の世代を追加したらここに展開する
  },
};
