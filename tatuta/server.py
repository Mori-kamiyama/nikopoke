#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yaml

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
MOVES_FILE = PROJECT_ROOT / "engine-rust" / "data" / "moves.yaml"
SPLIT_MOVES_DIR = PROJECT_ROOT / "engine-rust" / "data" / "moves"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_moves() -> dict:
    with MOVES_FILE.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data if isinstance(data, dict) else {}


def save_moves(moves: dict) -> None:
    MOVES_FILE.write_text(
        yaml.safe_dump(moves, allow_unicode=True, sort_keys=False, width=120),
        encoding="utf-8",
    )


def sanitize_move_id(move_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]+", "_", move_id)


def sanitize_type(type_name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]+", "_", type_name.lower())


def split_move_path(move_id: str, move_type: str) -> Path:
    return SPLIT_MOVES_DIR / sanitize_type(move_type) / f"{sanitize_move_id(move_id)}.yaml"


def write_split_move(move_id: str, move: dict, old_type: str | None = None) -> Path:
    move_type = move.get("type") if isinstance(move.get("type"), str) else "unknown"
    out_path = split_move_path(move_id, move_type)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(yaml.safe_dump(move, allow_unicode=True, sort_keys=False, width=120), encoding="utf-8")

    if old_type and sanitize_type(old_type) != sanitize_type(move_type):
        old_path = split_move_path(move_id, old_type)
        if old_path.exists():
            old_path.unlink()
    return out_path


class TatutaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json_response(self, payload: dict, code: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _parse_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        try:
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/moves":
            moves = load_moves()
            self._json_response(
                {
                    "moves": moves,
                    "count": len(moves),
                    "generatedAt": utc_now_iso(),
                }
            )
            return
        if path == "/api/move-yaml":
            query = parse_qs(parsed.query)
            move_id = (query.get("moveId") or [None])[0]
            if not isinstance(move_id, str) or not move_id:
                self._json_response({"ok": False, "error": "moveId is required"}, HTTPStatus.BAD_REQUEST)
                return
            moves = load_moves()
            move = moves.get(move_id)
            if not isinstance(move, dict):
                self._json_response({"ok": False, "error": "move not found"}, HTTPStatus.NOT_FOUND)
                return
            self._json_response(
                {"ok": True, "moveId": move_id, "yaml": yaml.safe_dump(move, allow_unicode=True, sort_keys=False, width=120)}
            )
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        body = self._parse_json()
        if body is None:
            self._json_response({"ok": False, "error": "invalid json"}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/moves/update":
            move_id = body.get("moveId")
            move_yaml = body.get("yaml")
            if not isinstance(move_id, str) or not move_id:
                self._json_response({"ok": False, "error": "moveId is required"}, HTTPStatus.BAD_REQUEST)
                return
            if not isinstance(move_yaml, str):
                self._json_response({"ok": False, "error": "yaml is required"}, HTTPStatus.BAD_REQUEST)
                return

            try:
                parsed_move = yaml.safe_load(move_yaml)
            except Exception as e:
                self._json_response({"ok": False, "error": f"yaml parse failed: {e}"}, HTTPStatus.BAD_REQUEST)
                return

            if not isinstance(parsed_move, dict):
                self._json_response({"ok": False, "error": "yaml root must be object"}, HTTPStatus.BAD_REQUEST)
                return
            if "steps" not in parsed_move or not isinstance(parsed_move.get("steps"), list):
                self._json_response({"ok": False, "error": "steps must be array"}, HTTPStatus.BAD_REQUEST)
                return
            parsed_move["id"] = move_id

            moves = load_moves()
            old = moves.get(move_id)
            old_type = old.get("type") if isinstance(old, dict) and isinstance(old.get("type"), str) else None
            moves[move_id] = parsed_move
            save_moves(moves)
            split_path = write_split_move(move_id, parsed_move, old_type)

            self._json_response(
                {
                    "ok": True,
                    "saved": True,
                    "moveId": move_id,
                    "path": str(MOVES_FILE),
                    "splitPath": str(split_path),
                    "yaml": yaml.safe_dump(parsed_move, allow_unicode=True, sort_keys=False, width=120),
                    "updatedAt": utc_now_iso(),
                }
            )
            return

        if path == "/api/yaml/parse":
            raw_yaml = body.get("yaml")
            if not isinstance(raw_yaml, str):
                self._json_response({"ok": False, "error": "yaml is required"}, HTTPStatus.BAD_REQUEST)
                return
            try:
                parsed_obj = yaml.safe_load(raw_yaml)
            except Exception as e:
                self._json_response({"ok": False, "error": f"yaml parse failed: {e}"}, HTTPStatus.BAD_REQUEST)
                return
            self._json_response({"ok": True, "object": parsed_obj})
            return

        if path == "/api/yaml/dump":
            obj = body.get("object")
            if not isinstance(obj, dict):
                self._json_response({"ok": False, "error": "object(dict) is required"}, HTTPStatus.BAD_REQUEST)
                return
            dumped = yaml.safe_dump(obj, allow_unicode=True, sort_keys=False, width=120)
            self._json_response({"ok": True, "yaml": dumped})
            return

        self._json_response({"ok": False, "error": "not found"}, HTTPStatus.NOT_FOUND)


def main() -> None:
    host = "127.0.0.1"
    port = 4173
    server = ThreadingHTTPServer((host, port), TatutaHandler)
    print(f"[tatuta] http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
