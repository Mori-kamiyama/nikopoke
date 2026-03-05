# Tatuta

`tatuta` は、`nikopoke` の技DSLを目視レビュー・直接修正するローカルWebツールです。

## できること

- 技名/IDで検索しながら `moves.yaml` を一覧表示
- Workflow（1. YAML読込 → 2. GUI編集 → 3. YAML生成 → 4. 保存）で編集
- Mermaid風フローで `steps` を左から右へ編集し、Flow Scriptを確認
- YAMLエディタは上級者向けパネルとして折りたたみ表示
- 保存時に `moves.yaml` と分割YAMLを直接更新

## 起動

```bash
cd /Users/yuta/date/TypeScript/nikipoke/nikopoke/tatuta
python3 server.py
```

起動後:

- [http://127.0.0.1:4173](http://127.0.0.1:4173)

## 保存先

- 本体更新: `engine-rust/data/moves.yaml`
- 分割更新: `engine-rust/data/moves/<type>/<id>.yaml`

## 補足

- 元データ読み込み元は `engine-rust/data/moves.yaml`
- 保存すると `moves.yaml` を直接上書きします
