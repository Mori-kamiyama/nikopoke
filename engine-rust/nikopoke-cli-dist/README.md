# 🎮 ニコポケ バトルCLI

ニコポケ用のバトルエンジン デバッグツールです。

## 📦 内容物

- `debug-cli` - デバッグCLI（機能が豊富）
- `battle-cli` - バトルCLI（対戦専用）
- `data/` - ポケモン・技データ

## 🚀 使い方

### Debug CLI（推奨）

```bash
./debug-cli
```

**機能:**
- 🎮 バトルシミュレーション
- 📊 ポケモン情報確認
- ⚔️ 技情報確認
- 🧮 ダメージ計算機

**日本語検索機能:**
- ポケモンや技を選択する際、ひらがな・カタカナで検索できます
- 入力で絞り込めます（例: 'ぴかちゅう' → 'pikachu'）

### Battle CLI

```bash
./battle-cli
```

**機能:**
- 3vs3のバトルシミュレーション
- AIとの対戦
- 詳細モード（技を自分で選択）

## ⚡ ヒント

- Debug CLIの技選択画面で、`/moves` コマンドで技の詳細を確認できます
- Battle CLIでは詳細モードで技を選べます（起動時に選択）
- ローマ字で検索できるので、「10まんボルト」は「10man」で検索可能

## 🐛 トラブルシューティング

### macOSで「開発元が未確認」エラーが出る場合

1. システム設定 → プライバシーとセキュリティ
2. 「このまま開く」をクリック

または、ターミナルで以下を実行:

```bash
xattr -d com.apple.quarantine debug-cli
xattr -d com.apple.quarantine battle-cli
```

### 実行権限がない場合

```bash
chmod +x debug-cli battle-cli
```

## 📝 データについて

- `data/species.json` - ポケモンデータ
- `data/moves.json` - 技データ
- `data/learnsets.json` - 習得技データ

データは実行可能ファイルに埋め込まれているので、`data/`フォルダは削除しても動作します。

---

楽しんでください！ 🎉
