# Pokemon Battle Spec 実装監査レポート (2026-03-04)

## 1. 目的と結論

`Pokemon Battle Spec.md` を基準に、`engine-rust` の実装とテストを突き合わせた。

結論:

- **エンジン基盤（状態遷移フレーム）は成立している**
- **公式対戦仕様への準拠度はまだ低い**
- **テストは「壊れていないこと」には効くが、「仕様どおりであること」の証明には不足**

総合評価（現時点）:

- 実装成熟度: **C-**
- テスト成熟度: **C**
- 「技が正しければロジック全体も正しい」と言い切れる状態: **未達**

## 2. 実測サマリ

- `cargo test` は **全件成功**（ユニット+統合で 50 テスト）
- 技データ（YAML）:
  - move YAML ファイル数: **599**
  - ユニーク move id: **593**
  - learnset に出るユニーク技: **442**
  - learnset 内で未定義技: **35**（= カバレッジ **92.1%**）
- `manual` エフェクトを持つ技: **59**
  - うち **53** は `manualReason` のみで、現在の実装では実質 no-op
    - 根拠: `manual` 実行は `manualReason` に `"Switching"` が含まれる場合のみ処理

## 3. 仕様章ごとの評価

| 仕様章 | 実装評価 | テスト評価 | 判定理由（要約） |
|---|---|---|---|
| ステータス計算 | C | D | 基本式はあるが性格補正・ヌケニン例外なし |
| ダメージ計算 | C- | D | 基本式/急所/STAB/相性はあるが、4096丸め・天候・やけど半減・壁・多くの補正順が未反映 |
| ターンフロー | C | C- | 優先度/素早さ/行動順は実装。終了時処理は簡略で速度順処理の不足あり |
| 状態異常 | C- | C- | 主要状態はあるが、もうどく仕様・タイプ免疫等が不足 |
| 実装上特殊な技 | D | D | `manual` no-op が多く、仕様記載の要件を満たさない技が多い |
| 特性 | C | C | 主要特性は一部対応。網羅性・相互作用順は不足 |
| 勝敗判定 | D | D | 全滅判定のみ。同時ひんし規則・時間切れ規則なし |
| ダブルバトル仕様 | E | E | モデルがシングル前提（アクティブ1枠） |

## 4. 主要ギャップ（優先度順）

## P0-1: `manual` 技の大半が実質無効

- `manual` 処理は `Switching` 理由にしか反応しないため、多くの技が no-op
- 例:
  - `counter`, `mirror_coat`, `final_gambit`, `leech_seed`, `destiny_bond` などが `manualReason: No supported effects inferred`

影響:

- 「技が正しく実装されたら証明できる」の前提が崩れる（技定義の時点で空振りが多数）

## P0-2: ダメージ式の仕様差分が大きい

- 4096補正体系なし
- 乱数は16段階ではなく連続値
- 急所時に防御側のプラスランク無視はあるが、攻撃側マイナスランク無視が未反映
- やけど半減、壁補正、天候補正、多数補正順の再現が不十分

影響:

- ダメージが一致しないケースが多発する

## P0-3: 状態異常の仕様差分

- `toxic` が `poison` 付与で定義されており、猛毒の増加ダメージ仕様がない
- 睡眠ターンが 2-4 に設定
- 交代時の状態保持ロジックが実仕様とズレる（sleep 除去など）
- 状態異常のタイプ免疫判定が能力依存のみで簡略

## P0-4: フィールド/速度/優先度まわりの未接続

- `trick_room`, `reflect`, `light_screen`, `tailwind` は field status 付与されるが、行動順・被ダメ計算への接続が不足
- ターン終了処理はあるが同フェーズ内の素早さ順処理や公式順序を完全には再現していない

## P0-5: 勝敗判定ロジック不足

- `is_battle_over` は「誰かが全滅したか」だけ
- 同時ひんしの勝敗規則・時間切れ判定の規則が未実装

## 5. 根拠コード（抜粋）

- 行動順ソート（優先度→素早さ→乱数）: `engine-rust/src/core/battle.rs:143`
- 終了時処理の簡略フロー: `engine-rust/src/core/battle.rs:470`
- 勝敗判定が全滅のみ: `engine-rust/src/core/battle.rs:667`
- 能力値計算（性格補正なし）: `engine-rust/src/core/factory.rs:51`
- ダメージ計算の本体: `engine-rust/src/core/effects.rs:1292`
- 乱数が連続値: `engine-rust/src/core/effects.rs:1430`
- STAB 1.5固定相当: `engine-rust/src/core/effects.rs:1434`
- 急所時に防御側のみ上昇ランク無視: `engine-rust/src/core/effects.rs:1383`
- 状態異常適用時の免疫判定が特性中心: `engine-rust/src/core/events.rs:203`
- 交代時に sleep を保持対象から外す実装: `engine-rust/src/core/events.rs:346`
- `manual` 実装（Switching のみ処理）: `engine-rust/src/core/effects.rs:110`

技データ例:

- `counter`: `engine-rust/data/moves/fighting/counter.yaml:11`
- `mirror_coat`: `engine-rust/data/moves/psychic/mirror_coat.yaml:11`
- `final_gambit`: `engine-rust/data/moves/fighting/final_gambit.yaml:11`
- `leech_seed`: `engine-rust/data/moves/grass/leech_seed.yaml:11`
- `toxic` が `poison` 付与: `engine-rust/data/moves/poison/toxic.yaml:11`
- `trick_room` field 付与: `engine-rust/data/moves/psychic/trick_room.yaml:11`
- species 側の `oppotunist` typo: `engine-rust/data/species.yaml:176`

## 6. 今後のテストケース TODO

## P0（最優先）

- [ ] ダメージ計算ゴールデンテストを追加（固定 seed, 固定盤面, 期待ダメージ範囲を明示）
- [ ] 急所仕様テストを追加
  - 攻撃側マイナスランク無視
  - 防御側プラスランク無視
  - 壁無視
- [ ] もうどくテストを追加（1/16→2/16…、交代リセット）
- [ ] まもる連続成功率テストを追加（1, 1/3, 1/9 …）
- [ ] 交代時状態維持テスト（sleep, toxic, volatile の正誤）
- [ ] `manual` 技を fail-fast で検出するテスト
  - `manualReason` が `Switching` 以外なら CI fail（当面）
- [ ] `field status` 接続テスト
  - `trick_room` で行動順反転
  - `reflect/light_screen/aurora_veil` で被ダメ変化
  - `tailwind` で速度補正
- [ ] 勝敗判定テスト
  - 反動/自爆/ターン終了同時ひんし/時間切れ規則

## P1（高）

- [ ] 技データ lint テスト
  - 不正 target リテラル（`all`, `相手` 等）
  - 誤 statusId（例: 雷技の付随状態異常）
  - learnset 参照先の未定義技
- [ ] 特性相互作用テスト拡張（状態異常×特性×フィールド）
- [ ] 終了時処理順のシナリオテスト（複数効果同時）

## P2（中）

- [ ] ダブルバトル仕様に向けたモデル拡張テスト（2アクティブ前提）
- [ ] 仕様章ごとの網羅率ダッシュボード（章→テストケースID紐づけ）

## 7. 「正しさ証明」に向けた一手

提案する一手:

- **差分検証（differential testing）を `step_battle` に導入する**

狙い:

- 「技定義が正しいなら、エンジン遷移も正しい」を機械的に担保する

最小実行プラン:

1. 単一ターンの入力（state, actions, rng列）を固定化
2. 自エンジンと参照実装（例: Showdown）に同入力を与える
3. 正規化した差分項目（HP, status, stage, field, faint/switch, action order）を比較
4. まずは P0 範囲（シングル、未対応 manual 技除外）で 1,000 ケース自動実行
5. CI で常時回し、差分ゼロを維持

これを先に敷くと、今後は「技実装追加 → 差分ゼロ確認」のループで仕様準拠を証明可能になる。
