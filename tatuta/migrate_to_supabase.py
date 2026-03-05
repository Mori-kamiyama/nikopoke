import json
import requests
import os

# Configuration
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-anon-key"  # or service_role key for bypass RLS
TABLE_NAME = "moves"

JSON_FILE = "moves_db.json"

def migrate():
    if not os.path.exists(JSON_FILE):
        print(f"Error: {JSON_FILE} not found.")
        return

    with open(JSON_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    moves_to_upload = []
    
    CORE_KEYS = {"id", "name", "type", "category", "pp", "power", "accuracy", "priority", "description", "tags", "steps"}

    for move_id, entry in data.items():
        obj = entry.get("obj", {})
        
        move = {
            "id": move_id,
            "name": obj.get("name", ""),
            "type": obj.get("type"),
            "category": obj.get("category"),
            "pp": obj.get("pp"),
            "power": obj.get("power"),
            "accuracy": obj.get("accuracy"),
            "priority": obj.get("priority", 0),
            "description": obj.get("description"),
            "tags": obj.get("tags", []),
            "steps": obj.get("steps", []),
            "extra_data": {k: v for k, v in obj.items() if k not in CORE_KEYS}
        }
        moves_to_upload.append(move)

    # Upload in chunks to avoid large request body
    chunk_size = 50
    for i in range(0, len(moves_to_upload), chunk_size):
        chunk = moves_to_upload[i : i + chunk_size]
        response = requests.post(f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}", headers=headers, json=chunk)
        
        if response.status_code in (200, 201):
            print(f"Uploaded chunk {i//chunk_size + 1}/{(len(moves_to_upload)-1)//chunk_size + 1}")
        else:
            print(f"Failed to upload chunk {i//chunk_size + 1}: {response.status_code} {response.text}")

if __name__ == "__main__":
    print("Welcome to Tatuta -> Supabase Migrator")
    print("Please ensure you have created the table using supabase_schema.sql first.")
    
    # Optional: Read from env or prompt
    url = input(f"Supabase URL [{SUPABASE_URL}]: ").strip()
    if url: SUPABASE_URL = url
    key = input(f"Supabase Key: ").strip()
    if key: SUPABASE_KEY = key
    
    migrate()
