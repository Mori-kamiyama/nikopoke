# ポケモンデータの作成手順書

このドキュメントでは、新しいポケモン（種族）をエンジンに追加する方法を説明します。

## 1. ディレクトリ構成

ポケモンデータは `data/species/` ディレクトリ内で管理します。

```text
data/
└── species/
    ├── index.js      (全ての種族をまとめてエクスポート)
    └── gen1.js       (第1世代のデータなど、任意に分割)
```

## 2. 種族データの定義 (`SpeciesData`)

`data/species/gen1.js` などに、以下の形式でデータを記述します。

```javascript
// data/species/gen1.js
module.exports = {
  pikachu: {
    id: "pikachu",
    name: "Pikachu",
    types: ["electric"],
    baseStats: {
      hp: 35,
      atk: 55,
      def: 40,
      spa: 50,
      spd: 50,
      spe: 90,
    },
    abilities: ["static", "lightning_rod"],
  },
  // 他のポケモンも同様に追加
};
```

### 各項目の説明

- `id`: プログラム内で参照する一意のID（小文字推奨）。
- `name`: 表示名。
- `types`: タイプの配列（2つまで）。
- `baseStats`: 種族値。
  - `hp`, `atk`, `def`, `spa`, `spd`, `spe` (S) の6項目。
- `abilities`: そのポケモンが持つ可能性のある特性の配列。

## 3. データの登録 (`index.js`)

`data/species/index.js` で、分割したファイルを統合してエクスポートします。

```javascript
// data/species/index.js
const gen1 = require("./gen1");

module.exports = {
  species: {
    ...gen1,
    // 他の世代を追加したらここに展開する
  },
};
```

## 4. バトル用インスタンスの生成 (`factory.js`)

作成したデータを使ってバトルで戦うポケモンを生成するには、`core/factory.js` の `createCreature` を使用します。

```javascript
const { species } = require("./data/species");
const { createCreature } = require("./core/factory");

// ピカチュウのインスタンスをLv50の実数値で生成
const myPikachu = createCreature(species.pikachu, {
  moves: ["thunderbolt", "quick_attack"], // 技のIDを指定
  ability: "lightning_rod",               // 特性を1つ選択（省略時は配列の0番目）
  name: "PikaPika",                       // ニックネーム（省略時は種族名）
});

console.log(myPikachu.maxHp); // 種族値から計算された実数値が出力される
```

## 補足：実数値の計算仕様

`core/factory.js` は以下の条件で計算を行います：

- **レベル**: 50固定
- **個体値 (IV)**: 全て 31
- **努力値 (EV)**: 全て 0
- 性格: 補正なし

これを変更したい場合は、`core/factory.js` の計算ロジックを拡張してください。

## 5. 参考データリスト

### タイプ名 (Types)

現在プログラム内で参照されている、または一般的に使われる英語名です。
`normal`, `fire`, `water`, `grass`, `electric`, `ice`, `fighting`, `poison`, `ground`, `flying`, `psychic`, `bug`, `rock`, `ghost`, `dragon`, `dark`, `steel`, `fairy`

### 実装済み特性名 (Abilities)

`abilities/index.js` にロジックが存在する、または参照されているIDです。

| ID                 | 日本語名（参考） | 備考                               |
|:------------------ |:-------- |:-------------------------------- |
| `intimidate`       | いかく      | 出した時、相手の攻撃を下げる                   |
| `download`         | ダウンロード   | 出した時、相手の防御を見て攻撃/特攻を上げる           |
| `drought`          | ひでり      | 出した時、天気を「にほんばれ」にする               |
| `moody`            | ムラっけ     | ターン終了時、能力が上がり、別の能力が下がる           |
| `magic_bounce`     | マジックミラー  | 変化技を跳ね返す                         |
| `lightning_rod`    | ひらいしん    | 電気技を無効化して特攻を上げる                  |
| `stamina`          | じきゅうりょく  | ダメージを受けると防御が上がる                  |
| `cotton_down`      | わたげ      | ダメージを受けると自分以外の素早さを下げる            |
| `berserk`          | ぎゃくじょう   | HPが半分を切ると特攻が上がる                  |
| `competitive`      | かちき      | 能力を下げられると特攻が2段階上がる               |
| `opportunist`      | びんじょう    | 相手の能力が上がると自分も上げる                 |
| `pure_power`       | ヨガパワー    | 物理火力が2倍になる                       |
| `hustle`           | はりきり     | 物理火力が1.5倍、命中が0.8倍になる             |
| `technician`       | テクニシャン   | 威力60以下の技の威力が1.5倍になる              |
| `sharpness`        | きれあじ     | 斬撃技の威力が1.5倍になる                   |
| `steelworker`      | はがねのつかい  | 鋼技の威力が1.5倍になる                    |
| `contrary`         | あまのじゃく   | 能力変化が逆転する                        |
| `simple`           | たんじゅん    | 能力変化が2倍になる                       |
| `unaware`          | てんねん     | 相手の能力変化を無視してダメージ計算する             |
| `prankster`        | いたずらごころ  | 変化技の優先度が+1される                    |
| `swift_swim`       | すいすい     | 雨の時、素早さが2倍になる                    |
| `chlorophyll`      | ようりょくそ   | 晴れの時、素早さが2倍になる                   |
| `thick_fat`        | あついしぼう   | 炎と氷のダメージを半減する                    |
| `fur_coat`         | ファーコート   | 物理防御が2倍になる                       |
| `libero`           | リベロ      | 出す技と同じタイプに変化する                   |
| `own_tempo`        | マイペース    | いかくや混乱を無効化する                     |
| `immunity`         | めんえき     | どく状態にならない                        |
| `compound_eyes`    | ふくがん     | 命中率が1.3倍になる                      |
| `insomnia`         | ふみん      | ねむり状態にならない                       |
| `receiver`         | レシーバー    | 味方が倒れた時、その特性を引き継ぐ（ダブル用）          |
| `power_of_alchemy` | かがくのちから  | 味方が倒れた時、その特性を引き継ぐ（ダブル用）          |
| `klutz`            | ぶきよう     | 自分が持っている道具の効果がなくなる               |
| `guts`             | こんじょう    | 状態異常の時、攻撃が1.5倍になる（やけどによる攻撃低下も無視） |
| `quick_feet`       | はやあし     | 状態異常の時、素早さが1.5倍になる               |
| `slow_start`       | スロースタート  | 出てから5ターンの間、攻撃と素早さが半分になる          |
| `parental_bond`    | おやこあい    | 攻撃技が威力0.25倍で追加攻撃する               |
| `shadow_tag`       | かげふみ     | 相手の交代を封じる                       |
| `unnerve`          | きんちょうかん  | 相手のきのみを使えなくする                   |
