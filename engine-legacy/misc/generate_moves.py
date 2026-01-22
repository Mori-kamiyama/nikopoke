#!/usr/bin/env python3
import os
import csv
import json
import re
import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Any


def load_env():
    env_file = ".env"
    if os.path.exists(env_file):
        with open(env_file, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    value = value.strip()
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    os.environ[key.strip()] = value


load_env()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

MODEL = "gemini-3-flash-preview"

DSL_REFERENCE = """
# DSLリファレンス（Engine）

## 技（Moves）
{
  id: "move_id",
  name: "Move Name",
  effects: [/* Effect objects */],
  pp: number, // optional
  // Optional
  type: "fire" | "water" | "grass" | "normal" | "electric" | "ice" | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug" | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy",
  category: "physical" | "special" | "status",
  priority: number,
  tags: ["slicing", ...],
  critRate: number
}

## Effect

### damage
{ type: "damage", power: number, accuracy?: number }

### speed_based_damage
{ type: "speed_based_damage", accuracy?: number, thresholds: [{ ratio: number, power: number }], basePower?: number }

### apply_status
{ type: "apply_status", statusId: string, target?: "self"|"target"|"all", duration?: number|{min:number,max:number}|null, chance?: number, data?: object }

### remove_status
{ type: "remove_status", statusId: string, target?: "self"|"target"|"all" }

### cure_all_status
{ type: "cure_all_status", target?: "self"|"target"|"all" }

### apply_field_status / remove_field_status
{ type: "apply_field_status", statusId: string, duration?: number|null, data?: object }
{ type: "remove_field_status", statusId: string }

### replace_status
{ type: "replace_status", from: string, to: string, duration?: number|null, data?: object, target?: "self"|"target"|"all" }

### modify_stage
{ type: "modify_stage", target?: "self"|"target"|"all", stages: { atk?: number, def?: number, spa?: number, spd?: number, spe?: number } }

### clear_stages / reset_stages
{ type: "clear_stages", target?: "self"|"target"|"all" }
{ type: "reset_stages", target?: "self"|"target"|"all" }

### disable_move
{ type: "disable_move", moveId: string, target?: "self"|"target"|"all", duration?: number|null }

### chance
{ type: "chance", p: number, then: [Effect], else?: [Effect] }

### repeat
{ type: "repeat", times: number|{min:number,max:number}, effects: [Effect] }

### conditional
{ type: "conditional", if: Condition, then: [Effect], else?: [Effect] }

### damage_ratio
{ type: "damage_ratio", ratioMaxHp: number, target?: "self"|"target"|"all" }

### delay
{ type: "delay", afterTurns: number, timing?: "turn_start"|"turn_end", effects: [Effect], target?: "self"|"target"|"all" }

### over_time
{ type: "over_time", timing?: "turn_start"|"turn_end", effects: [Effect], target?: "self"|"target"|"all" }

### protect
{ type: "protect" }

### apply_item / remove_item / consume_item
{ type: "apply_item", itemId?: string, target?: "self"|"target" }
{ type: "remove_item", target?: "self"|"target" }
{ type: "consume_item", target?: "self"|"target", markBerryConsumed?: boolean }

### ohko
{ type: "ohko", baseAccuracy?: number, nonMatchingTypeAccuracy?: number, requiredType?: string, levelScaling?: boolean, respectTypeImmunity?: boolean, immuneTypes?: string[] }

### random_move
{ type: "random_move", pool?: "all"|"self_moves"|"physical"|"special"|"status" }

## Condition
- { type: "target_has_status", statusId: string }
- { type: "user_has_status", statusId: string }
- { type: "user_type", typeId: string }
- { type: "target_has_item" }
- { type: "user_has_item" }
- { type: "target_hp_lt", value: number }
- { type: "field_has_status", statusId: string }
- { type: "weather_is_sunny" }
- { type: "weather_is_raining" }
- { type: "weather_is_hail" }
- { type: "weather_is_sandstorm" }

## Status ID
- burn
- poison
- paralysis
- sleep
- freeze
- confusion
- flinch
- protect
- lock_move
- disable_move
- delayed_effect
- over_time_effect

## Type Mapping (Japanese to English)
ノーマル -> normal
ほのお -> fire
みず -> water
でんき -> electric
くさ -> grass
こおり -> ice
かくとう -> fighting
どく -> poison
じめん -> ground
ひこう -> flying
エスパー -> psychic
むし -> bug
いわ -> rock
ゴースト -> ghost
ドラゴン -> dragon
あく -> dark
はがね -> steel
フェアリー -> fairy

## Category Mapping
物理 -> physical
特殊 -> special
変化 -> status
"""


def create_prompt(move_data: Dict[str, str]) -> str:
    name = move_data["わざ"]
    type_ja = move_data["タイプ"]
    power = move_data["いりょく"]
    accuracy = move_data["めいちゅう"]
    pp = move_data["PP"]
    category_ja = move_data["ぶんるい"]
    contact = move_data["接触/非接触"]
    effect = move_data["効果"]

    type_mapping = {
        "ノーマル": "normal",
        "ほのお": "fire",
        "みず": "water",
        "でんき": "electric",
        "くさ": "grass",
        "こおり": "ice",
        "かくとう": "fighting",
        "どく": "poison",
        "じめん": "ground",
        "ひこう": "flying",
        "エスパー": "psychic",
        "むし": "bug",
        "いわ": "rock",
        "ゴースト": "ghost",
        "ドラゴン": "dragon",
        "あく": "dark",
        "はがね": "steel",
        "フェアリー": "fairy",
        "": "normal",
    }

    category_mapping = {"物理": "physical", "特殊": "special", "変化": "status"}

    type_en = type_mapping.get(type_ja, "normal")
    category_en = category_mapping.get(
        category_ja, "status" if power == "-" else "physical"
    )
    try:
        pp_value = int(pp) if pp and pp.isdigit() else None
    except Exception:
        pp_value = None
    pp_field = f'pp: {pp_value}, ' if pp_value is not None else ""

    prompt = f"""以下のポケモンの技をDSL形式（JavaScriptオブジェクトの1エントリ）に変換してください。

技の情報:
- 技名（日本語）: {name}
- タイプ: {type_ja} -> {type_en}
- 威力: {power}
- 命中率: {accuracy}
- PP: {pp}
- 分類: {category_ja} -> {category_en}
- 接触/非接触: {contact}
- 効果: {effect}

出力形式は以下のようにしてください（movesのキー付きエントリ、1行のみ）:
```javascript
move_id_here: {{ id: "move_id_here", name: "{name}", type: "{type_en}", category: "{category_en}", {pp_field}effects: [ /* ... */ ] }}
```

重要なルール:
1. 威力がある場合は damage effect を使用
2. 命中率が "-" の場合は accuracy を指定しない
3. 命中率・確率は 0.0〜1.0 に正規化する（例: 命中率85 -> 0.85）
4. 変化技の命中率は chance で表現する（apply_status は chance、他は chance で包む）
5. 状態異常を付与する場合は apply_status effect を使用
6. 能力ランクを変化させる場合は modify_stage effect を使用
7. 確率で発動する場合は chance effect を使用
8. 複数回攻撃は repeat effect を使用（2〜5回などは min/max）
9. HP回復やダメージ比率は damage_ratio effect を使用
10. 1ターン目に攻撃せず2ターン目に攻撃する技は delay effect を使用
11. 毎ターン効果がある場合は over_time effect を使用
12. 先制/後攻の記述があれば priority を設定する（例: +1, -6）
13. 効果の記述から適切なEffectを推測してDSLで表現してください
14. statusIdは日本語の説明から英語のstatusIdを推測してください（例: やけど->burn, まひ->paralysis, ねむり->sleep, こんらん->confusion, どく->poison）
15. move_id_here は英語の技名を snake_case で付け、キーと id を一致させる
16. PPが数値なら pp: <number> を含める（\"-\" や空なら省略）
17. 余計な外側の `{{}}` やコードフェンスは出力しない
18. DSLで表現できない場合は manual: true と manualReason を付け、effects は最小限にする

{DSL_REFERENCE}

JavaScriptオブジェクトのみを出力してください。"""

    return prompt


def generate_move_dsl(move_data: Dict[str, str]) -> str:
    prompt = create_prompt(move_data)

    data = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": "You are a Pokemon battle engine DSL generator. Convert Pokemon move descriptions to DSL format (JavaScript objects). Output ONLY JavaScript object, no explanations.\n\n"
                        + prompt
                    }
                ],
            }
        ],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }

    max_retries = 5
    for attempt in range(max_retries):
        try:
            response = requests.post(API_URL, json=data, timeout=60)
            response.raise_for_status()
            result = response.json()

            if "candidates" not in result or not result["candidates"]:
                print(f"API Error: No candidates in response for {move_data['わざ']}")
                print(f"Response: {json.dumps(result, indent=2, ensure_ascii=False)}")
                raise Exception("No candidates in response")

            content = result["candidates"][0]["content"]["parts"][0]["text"]

            if "```javascript" in content:
                content = content.split("```javascript")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            time.sleep(0.1)
            return content
        except requests.exceptions.RequestException as e:
            if e.response is not None and e.response.status_code == 429:
                wait_time = 10
                print(
                    f"Rate limit hit for {move_data['わざ']}, waiting {wait_time}s..."
                )
                time.sleep(wait_time)
                continue
            print(f"Request Error for {move_data['わざ']}: {e}")
            if e.response is not None:
                print(f"Response: {e.response.text}")
            raise
    raise Exception(f"Max retries exceeded for {move_data['わざ']}")


def detect_manual_flag(move_dsl: str) -> Dict[str, str]:
    if not move_dsl:
        return {"manual": "true", "reason": "empty_output"}
    if re.search(r"\bmanual\s*:\s*true\b", move_dsl):
        reason_match = re.search(
            r"\bmanualReason\s*:\s*['\"]([^'\"]+)['\"]", move_dsl
        )
        reason = reason_match.group(1) if reason_match else "flagged_by_model"
        return {"manual": "true", "reason": reason}
    return {"manual": "false", "reason": ""}


def strip_code_fence(text: str) -> str:
    if "```" not in text:
        return text.strip()
    if "```javascript" in text:
        return text.split("```javascript")[1].split("```")[0].strip()
    return text.split("```")[1].split("```")[0].strip()


def find_matching_brace(text: str, start_index: int) -> int:
    depth = 0
    for i in range(start_index, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return -1


def normalize_move_entry(move_dsl: str) -> Dict[str, str]:
    raw = strip_code_fence(move_dsl)
    raw_strip = raw.lstrip()
    if raw_strip.startswith("{"):
        start = raw.index("{")
        end = find_matching_brace(raw, start)
        if end == len(raw.strip()) - 1:
            raw = raw[start + 1 : end].strip()
    m = re.search(r"^\s*([a-z0-9_]+)\s*:\s*{", raw)
    if not m:
        id_match = re.search(r'\bid\s*:\s*["\']([^"\']+)["\']', raw)
        if id_match and raw.strip().startswith("{"):
            key = id_match.group(1)
            value = raw.strip()
            return {"ok": "true", "reason": "", "key": key, "value": value}
        return {"ok": "false", "reason": "format_missing_key", "key": "", "value": ""}
    key = m.group(1)
    brace_start = raw.find("{", m.end() - 1)
    brace_end = find_matching_brace(raw, brace_start)
    if brace_start < 0 or brace_end < 0:
        return {
            "ok": "false",
            "reason": "format_unbalanced_brace",
            "key": key,
            "value": "",
        }
    value = raw[brace_start : brace_end + 1].strip()
    id_match = re.search(r'\bid\s*:\s*["\']([^"\']+)["\']', value)
    if id_match and id_match.group(1) != key:
        value = re.sub(
            r'\bid\s*:\s*["\'][^"\']+["\']',
            f'id: "{key}"',
            value,
            count=1,
        )
    return {"ok": "true", "reason": "", "key": key, "value": value}


def main():
    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY environment variable is not set.")
        print("Please set it using: export GEMINI_API_KEY='your-api-key'")
        return

    input_file = "move_data.csv"
    output_file = "data/moves/index.js"
    manual_file = "data/moves/manual_review.json"

    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found.")
        return

    with open(input_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        moves_data = list(reader)

    generated_moves = []
    manual_moves = []

    def run_one(index, move):
        name = move["わざ"]
        print(f"Generating DSL for move {index + 1}/{len(moves_data)}: {name}")
        try:
            move_dsl = generate_move_dsl(move)
            flag = detect_manual_flag(move_dsl)
            normalized = normalize_move_entry(move_dsl)
            return {
                "index": index,
                "name": name,
                "effect": move["効果"],
                "dsl": move_dsl,
                "manual": flag["manual"] == "true" or normalized["ok"] != "true",
                "reason": flag["reason"]
                if flag["manual"] == "true"
                else normalized["reason"],
                "key": normalized["key"],
                "value": normalized["value"],
            }
        except Exception as e:
            print(f"Error generating DSL for {name}: {e}")
            return {
                "index": index,
                "name": name,
                "effect": move["効果"],
                "dsl": "",
                "manual": True,
                "reason": "generation_error",
                "key": "",
                "value": "",
            }

    results = [None] * len(moves_data)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [
            executor.submit(run_one, i, move) for i, move in enumerate(moves_data)
        ]
        for future in as_completed(futures):
            res = future.result()
            results[res["index"]] = res

    for res in results:
        if not res:
            continue
        if res.get("key") and res.get("value"):
            generated_moves.append({"key": res["key"], "value": res["value"]})
        if res["manual"]:
            manual_moves.append(
                {
                    "name": res["name"],
                    "reason": res["reason"],
                    "effect": res["effect"],
                }
            )

    output_content = f"// Auto-generated from move_data.csv\n// {len(generated_moves)} moves generated\n\nconst moves = {{\n"
    for move in generated_moves:
        output_content += f"  {move['key']}: {move['value']},\n"
    output_content = (
        output_content.rstrip(",\n") + "\n};\n\nmodule.exports = {{ moves }};"
    )

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(output_content)

    with open(manual_file, "w", encoding="utf-8") as f:
        json.dump(manual_moves, f, ensure_ascii=False, indent=2)

    print(f"\nGenerated {len(generated_moves)} moves to {output_file}")
    print(f"Manual review list: {manual_file} ({len(manual_moves)} entries)")


if __name__ == "__main__":
    main()
