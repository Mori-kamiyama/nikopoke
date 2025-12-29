# わざデータの作成手順書

このドキュメントでは、新しいわざ（Move）をエンジンに追加する方法を説明します。

## 1. ディレクトリ構成

わざデータは `data/moves/index.js` で管理します。

```text
data/
└── moves/
    └── index.js
```

## 2. わざ定義の形式

`data/moves/index.js` に以下の形式で追加します。

```js
// data/moves/index.js
const moves = {
  ember: {
    id: "ember",
    name: "Ember",
    type: "fire",
    category: "special",
    pp: 25,
    effects: [
      { type: "damage", power: 40, accuracy: 1.0 },
      { type: "apply_status", statusId: "burn", chance: 0.1, target: "target" },
    ],
  },
};

module.exports = { moves };
```

### 各項目の説明

- `id`: プログラム内で参照する一意のID（小文字推奨）。
- `name`: 表示名。
- `type`: タイプ（`fire`, `water`, `grass` など）。
- `pp`: 技の使用回数（省略時は無制限）。
- `category`: `physical` / `special` / `status`。
  - 省略時は `damage` を含む場合は物理、そうでなければ変化。
- `effects`: 効果配列。DSLのEffectを並べます。
- `priority`: 優先度（任意）。
- `tags`: 補助タグ（例: `["slicing"]`）。
- `critRate`: 急所ランク補正（任意）。

## 3. Effectの書き方

Effectの詳細は `DSL.md` を参照してください。代表的な例:

```js
{ type: "damage", power: 90, accuracy: 1.0 }
{ type: "apply_status", statusId: "poison", chance: 0.3, target: "target" }
{ type: "conditional", if: { type: "target_has_status", statusId: "poison" }, then: [...], else: [...] }
{ type: "repeat", count: { min: 2, max: 5 }, effects: [...] }
```

## 4. バトルで使う

作成したわざIDをポケモンの `moves` に指定します。

```js
const { createCreature } = require("./core/factory");
const { species } = require("./data/species");

const myMon = createCreature(species.pikachu, {
  moves: ["ember"],
});
```

## 補足

- タイプ相性とSTABはダメージ計算に反映されます。
- 無効相性はダメージ0になります。
