import os
import yaml
import json

SOURCE_DIR = "../engine-rust/data/moves"
OUTPUT_FILE = "moves_db.json"

def build():
    db = {}
    print(f"Scanning {SOURCE_DIR}...")

    # Traverse directory
    for root, dirs, files in os.walk(SOURCE_DIR):
        for file in files:
            if file.endswith(".yaml"):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        raw = f.read()
                        
                        # Parse YAML to object
                        # We use safe_load but need to handle potential custom types if any. 
                        # For simple move data, safe_load should be fine.
                        obj = yaml.safe_load(raw)
                        
                        if not obj or "id" not in obj:
                            print(f"Skipping {file}: No ID found or invalid YAML")
                            continue
                        
                        move_id = obj["id"]
                        db[move_id] = {
                            "obj": obj,
                            "yaml": raw
                        }
                except Exception as e:
                    print(f"Error reading {file}: {e}")

    print(f"Found {len(db)} moves.")
    
    # Sort keys for consistent output
    sorted_db = {k: db[k] for k in sorted(db)}
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted_db, f, indent=2, ensure_ascii=False)
    
    print(f"Generated {OUTPUT_FILE}")

if __name__ == "__main__":
    build()
