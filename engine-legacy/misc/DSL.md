# DSLリファレンス（Engine）

このドキュメントは、現在のバトルエンジンで使われているDSLの仕様をまとめたものです。
`data/moves.js`、`effects/index.js`、`statuses/index.js`、`abilities/index.js` の実装に準拠しています。

## 概要

- DSLはJavaScriptのオブジェクトとして定義します（現状は `data/moves.js`）。
- 技は `effects` 配列で効果を定義します。
- EffectはEventを生成し、Eventが状態を更新します。
- Status/Abilityはコード側に実装され、idで参照します。

## 技（Moves）

技定義の形は以下です。

```js
{
  id: "move_id",
  name: "Move Name",
  effects: [/* Effect objects */],
  pp: number, // optional
  // Optional
  type: "fire" | "water" | "steel" | ...,
  category: "physical" | "special" | "status",
  priority: number,
  tags: ["slicing", ...],
  critRate: number
}
```

注記:
- `category` 未指定の場合、`damage` 効果を持つ技は物理扱い、それ以外は変化技扱いです。
- `tags: ["slicing"]` はきれあじ（`ability: "sharpness"`）の対象です。
- `critRate` は急所ランクに加算されます（きょううんは+1）。
- `pp` を省略した場合は無制限として扱います（実装では null 保存）。

## Effect

`effects/index.js` で解釈され、ネスト可能です。

### damage

```js
{ type: "damage", power: number, accuracy?: number }
```

- 攻撃側と防御側の能力を用いてダメージ計算。
- `accuracy` の既定は 1.0。
- はりきりは物理命中を下げ、物理火力を上げます。
- おやこあいは2回目の攻撃（威力25%）を追加します。

### speed_based_damage

```js
{ type: "speed_based_damage", accuracy?: number, thresholds: [{ ratio: number, power: number }], basePower?: number }
```

- 攻撃側/防御側の素早さの比（攻撃側 ÷ 防御側）を元に `thresholds` を降順チェックし、対応する威力で `damage` を行います。
- `targetSpeed` が0の場合は最大威力を使用します。

### apply_status

```js
{ type: "apply_status", statusId: string, target?: "self"|"target"|"all", duration?: number|null, chance?: number, stack?: boolean, data?: object }
```

- `chance` は確率（0.0–1.0）。既定は1.0。
- `duration` はターン数。`null` は無期限。
- `stack` は重複許可。既定は false。
- 免疫系の特性は `core/events.js` 側で判定。
- 命中率がある変化技は `chance` で表現します。`modify_stage` など単体効果の場合は `chance` で包みます。

### remove_status

```js
{ type: "remove_status", statusId: string, target?: "self"|"target"|"all" }
```

### cure_all_status

```js
{ type: "cure_all_status", target?: "self"|"target"|"all" }
```

### apply_field_status / remove_field_status

```js
{ type: "apply_field_status", statusId: string, duration?: number|null, stack?: boolean, data?: object }
{ type: "remove_field_status", statusId: string }
```

フィールド（天候など）の効果を `field.global` に追加/除去します。

### replace_status

```js
{ type: "replace_status", from: string, to: string, duration?: number|null, data?: object, target?: "self"|"target"|"all" }
```

### modify_stage

```js
{ type: "modify_stage", target?: "self"|"target"|"all", stages: { atk?: number, def?: number, spa?: number, spd?: number, spe?: number }, clamp?: boolean, fail_if_no_change?: boolean, show_event?: boolean }
```

- `clamp` は既定で true（-6〜+6に制限）。
- `fail_if_no_change` が true の場合、変化がなければ失敗扱い。
- `show_event` はログ出力の有無。
- あまのじゃく/たんじゅんは `core/events.js` 側で変化量を補正。

### clear_stages / reset_stages

```js
{ type: "clear_stages", target?: "self"|"target"|"all", show_event?: boolean }
{ type: "reset_stages", target?: "self"|"target"|"all", show_event?: boolean }
```

### disable_move

```js
{ type: "disable_move", moveId: string, target?: "self"|"target"|"all", duration?: number|null }
```

### chance

```js
{ type: "chance", p: number, then: [Effect], else?: [Effect] }
```

### repeat

```js
{ type: "repeat", times: number, effects: [Effect] }
```

### conditional

```js
{
  type: "conditional",
  if: Condition,
  then: [Effect],
  else?: [Effect]
}
```

### damage_ratio

```js
{ type: "damage_ratio", ratioMaxHp: number, target?: "self"|"target"|"all" }
```

### delay

```js
{ type: "delay", afterTurns: number, timing?: "turn_start"|"turn_end", effects: [Effect], target?: "self"|"target"|"all" }
```

`delayed_effect` ステータスを作成し、指定ターン後に発動します。

### over_time

```js
{ type: "over_time", timing?: "turn_start"|"turn_end", effects: [Effect], target?: "self"|"target"|"all" }
```

`over_time_effect` ステータスを作成し、毎ターン発動します。

### apply_item / remove_item / consume_item

```js
{ type: "apply_item", itemId?: string, target?: "self"|"target" }
{ type: "remove_item", target?: "self"|"target" }
{ type: "consume_item", target?: "self"|"target", markBerryConsumed?: boolean }
```

- シンプルな持ち物管理。`consume_item` は保持アイテムを削除し、ベリーなら `berry_consumed` を付与します。

### ohko

```js
{ type: "ohko", baseAccuracy?: number, nonMatchingTypeAccuracy?: number, requiredType?: string, levelScaling?: boolean, respectTypeImmunity?: boolean, immuneTypes?: string[] }
```

- 一撃必殺系の処理。命中率は `baseAccuracy`（既定0.3）にレベル差/100を加算し、0〜1にクランプ。
- `requiredType` が指定されていて一致しない場合は `nonMatchingTypeAccuracy` を基準に判定。
- 既定で相手のレベルが高いと失敗し、タイプ無効も尊重します（`respectTypeImmunity`）。

### random_move  (新規)

```js
{ type: "random_move", pool?: "all"|"self_moves"|"physical"|"special"|"status" }
```

- デフォルトは `"all"`。`pool` で候補を絞りたい場合に指定。
- ゆびをふる等で、ランダムな技を1つ実行するための簡易フック。

## Condition

`effects/index.js` でサポートされる条件:

```js
{ type: "target_has_status", statusId: string }
{ type: "target_has_item" }
{ type: "user_has_item" }
{ type: "user_has_status", statusId: string }
{ type: "user_type", typeId: string }
{ type: "target_hp_lt", value: number }
{ type: "field_has_status", statusId: string }
{ type: "weather_is_sunny" }
{ type: "weather_is_raining" }
{ type: "weather_is_hail" }
{ type: "weather_is_sandstorm" }
```

`value` は割合（例: 0.5 で 50%）。

## Status ID

`statusId` は `statuses/index.js` に実装されます。
テストで使われているもの:

- `burn`
- `poison`
- `flinch`
- `lock_move`
- `disable_move`
- `delayed_effect`
- `over_time_effect`

## Ability

特性は `ability` として各クリーチャーに設定します。DSLで定義はせず、idで参照します。

実装済みid:

- `pure_power`
- `hustle`
- `guts`
- `technician`
- `sharpness`
- `steelworker`
- `merciless`
- `super_luck`
- `download`
- `contrary`
- `simple`
- `moody`
- `competitive`
- `opportunist`
- `unaware`
- `berserk`
- `prankster`
- `swift_swim`
- `chlorophyll`
- `quick_feet`
- `slow_start`
- `cotton_down`
- `fur_coat`
- `stamina`
- `thick_fat`
- `lightning_rod`
- `magic_bounce`
- `immunity`
- `insomnia`
- `own_tempo`
- `libero`
- `intimidate`
- `drought`
- `parental_bond`
- `shadow_tag`
- `unnerve`
- `receiver`（no-op: ダブル未実装）
- `power_of_alchemy`（no-op: ダブル未実装）
- `klutz`

## Target

`target` を持つEffectの指定:

- `self` -> 攻撃者
- `target` -> 対象
- `all` -> 現状は1v1のため対象扱い

## RNG

ダメージ技におけるRNG消費順:

1) 行動順の同速判定
2) 命中判定
3) 急所判定
4) ダメージ乱数

状態異常の確率判定は追加でRNGを消費します。

## タイプ相性

ダメージ技はタイプ相性とSTABを考慮します。

- 攻撃側が技タイプと一致する場合、1.5倍のSTAB補正。
- 防御側のタイプ相性は弱点/耐性/無効を反映（無効は0倍）。
- 複合タイプは各タイプ倍率を乗算。

## 制限事項

- 1v1のみ対応。
- 一部特性はno-op（上記参照）。
