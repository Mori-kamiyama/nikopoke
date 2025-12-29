use engine_rust::data::moves::MoveDatabase;
use std::path::Path;

#[test]
fn load_full_move_database() {
    let path = Path::new("data/moves.json");
    let db = MoveDatabase::load_from_json_file(path).expect("load moves.json");
    assert!(!db.as_map().is_empty(), "move database should not be empty");
    assert!(db.get("tackle").is_some(), "expected tackle in full database");
}
