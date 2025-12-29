#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Set

ROOT = Path(__file__).parent
CSV_PATH = ROOT / "技制限.csv"
MOVE_DATA_PATH = ROOT / "move_data.csv"
MOVE_JS_PATH = ROOT / "data" / "moves" / "index.js"
OUTPUT_PATH = ROOT / "data" / "learnsets" / "index.js"

# Manually resolve ambiguous entries
MOVE_NAME_OVERRIDES: Dict[str, str] = {
    "タネマシンガン": "bullet_seed",
}

SPECIES_NAME_OVERRIDES: Dict[str, str] = {
    "はるた": "haruta",  # name is currently blank in species data
    "れお": "reosan",    # shorthand alias
}


def run_node_json(script: str):
    """Execute a small Node script and parse the JSON it prints."""
    result = subprocess.check_output(
        ["node", "-e", script], text=True, cwd=ROOT
    )
    return json.loads(result)


def load_move_name_map() -> Dict[str, str]:
    """Return mapping from Japanese move name -> move id by aligning move_data.csv with data/moves/index.js order."""
    if not MOVE_DATA_PATH.exists():
        raise SystemExit(f"Missing move data: {MOVE_DATA_PATH}")
    if not MOVE_JS_PATH.exists():
        raise SystemExit(f"Missing generated moves: {MOVE_JS_PATH}")

    with MOVE_DATA_PATH.open(encoding="utf-8") as f:
        move_rows = list(csv.DictReader(f))

    text = MOVE_JS_PATH.read_text(encoding="utf-8")
    start = text.find("const moves")
    if start == -1:
        raise SystemExit("Could not locate moves object in data/moves/index.js")

    move_keys: List[str] = []
    move_names: List[str] = []
    depth = 0
    in_string = False
    string_char = ""
    i = start
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == string_char:
                in_string = False
        else:
            if ch in ("'", '"'):
                in_string = True
                string_char = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            elif depth == 1 and (ch.isalpha() or ch == "_"):
                j = i + 1
                while j < len(text) and (text[j].isalnum() or text[j] == "_"):
                    j += 1
                k = j
                while k < len(text) and text[k].isspace():
                    k += 1
                if k < len(text) and text[k] == ":":
                    move_keys.append(text[i:j])
                i = j - 1
        i += 1

    move_names = [m.group(1) for m in re.finditer(r'name:\s*"([^"]+)"', text)]

    if len(move_keys) != len(move_names):
        raise SystemExit("Failed to align move keys and names.")

    duplicates_to_trim = {"タネマシンガン": 1}
    seen_counts = Counter()
    entries: List[tuple[str, str]] = []
    for key, name in zip(move_keys, move_names):
        seen_counts[name] += 1
        allowed = duplicates_to_trim.get(name)
        if allowed is not None and seen_counts[name] > allowed:
            continue  # Skip known extra duplicate entries
        entries.append((key, name))

    if len(entries) != len(move_rows):
        raise SystemExit(
            f"move_data.csv rows ({len(move_rows)}) and filtered move entries ({len(entries)}) differ; cannot align."
        )

    name_to_ids: Dict[str, Set[str]] = defaultdict(set)
    for row, (key, _) in zip(move_rows, entries):
        name = (row.get("わざ") or "").strip()
        if name:
            name_to_ids[name].add(key)

    name_to_id: Dict[str, str] = {}
    ambiguous = {}
    for name, ids in name_to_ids.items():
        if len(ids) == 1:
            name_to_id[name] = next(iter(ids))
            continue
        override = MOVE_NAME_OVERRIDES.get(name)
        if override and override in ids:
            name_to_id[name] = override
        else:
            ambiguous[name] = sorted(ids)

    if ambiguous:
        message = "\n".join(
            f"- {name}: {', '.join(ids)}" for name, ids in ambiguous.items()
        )
        raise SystemExit(f"Ambiguous move names (add MOVE_NAME_OVERRIDES):\n{message}")

    return name_to_id


def load_species_name_map() -> Dict[str, str]:
    """Return mapping from Japanese species name -> species id."""
    script = (
        "const { species } = require('./data/species');"
        "console.log(JSON.stringify(Object.values(species)));"
    )
    species_list = run_node_json(script)
    mapping: Dict[str, str] = {}
    for entry in species_list:
        name = (entry.get("name") or "").strip()
        species_id = entry.get("id")
        if name and species_id:
            mapping[name] = species_id
    mapping.update(SPECIES_NAME_OVERRIDES)
    return mapping


def parse_targets(raw: str) -> List[str]:
    cleaned = (raw or "").replace("\n", "").replace("\r", "")
    parts = [p.strip() for p in cleaned.split("、")]
    return [p for p in parts if p]


def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Missing CSV: {CSV_PATH}")

    move_name_to_id = load_move_name_map()
    species_name_to_id = load_species_name_map()
    all_species_ids: Set[str] = set(species_name_to_id.values())

    with CSV_PATH.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    learnsets: Dict[str, Set[str]] = {sid: set() for sid in all_species_ids}
    missing_moves = []
    missing_species = defaultdict(list)

    for row in rows:
        move_name = (row.get("わざ") or "").strip()
        move_id = move_name_to_id.get(move_name)
        if not move_id:
            missing_moves.append(move_name)
            continue

        targets = parse_targets(row.get("配布対象") or "")
        target_ids: Set[str] = set()
        for target in targets:
            if target == "全員":
                target_ids.update(all_species_ids)
                continue
            species_id = species_name_to_id.get(target)
            if not species_id:
                missing_species[target].append(move_name)
                continue
            target_ids.add(species_id)

        for sid in target_ids:
            learnsets.setdefault(sid, set()).add(move_id)

    if missing_species:
        details = "\n".join(
            f"- {name}: {', '.join(sorted(set(moves)))}"
            for name, moves in missing_species.items()
        )
        raise SystemExit(f"Species names not resolved (add SPECIES_NAME_OVERRIDES):\n{details}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "// Auto-generated from 技制限.csv",
        "const learnsets = {",
    ]
    for sid in sorted(learnsets.keys()):
        move_list = sorted(learnsets[sid])
        move_str = ", ".join(f'\"{m}\"' for m in move_list)
        lines.append(f"  {sid}: [{move_str}],")
    lines.append("};")
    lines.append("")
    lines.append("module.exports = { learnsets };")

    OUTPUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote learnsets for {len(learnsets)} species to {OUTPUT_PATH}")
    if missing_moves:
        unique_missing = sorted(set(missing_moves))
        print(
            f"Skipped {len(unique_missing)} moves not present in data/moves: "
            + ", ".join(unique_missing)
        )


if __name__ == "__main__":
    main()
