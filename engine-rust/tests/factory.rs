use engine_rust::core::factory::{create_creature, CreateCreatureOptions};
use engine_rust::data::learnsets::LearnsetDatabase;
use engine_rust::data::moves::MoveDatabase;
use engine_rust::data::species::SpeciesDatabase;

#[test]
fn create_creature_from_species() {
    let species_db = SpeciesDatabase::load_default().expect("load species");
    let learnsets = LearnsetDatabase::load_default().expect("load learnsets");
    let move_db = MoveDatabase::load_default().expect("load moves");
    let species = species_db.get("eiraku").expect("species exists");

    let creature = create_creature(
        species,
        CreateCreatureOptions {
            moves: Some(vec!["tackle".to_string()]),
            ..Default::default()
        },
        &learnsets,
        &move_db,
    )
    .expect("create creature");

    assert_eq!(creature.species_id, "eiraku");
    assert_eq!(creature.moves, vec!["tackle"]);
}

#[test]
fn create_creature_rejects_invalid_move() {
    let species_db = SpeciesDatabase::load_default().expect("load species");
    let learnsets = LearnsetDatabase::load_default().expect("load learnsets");
    let move_db = MoveDatabase::load_default().expect("load moves");
    let species = species_db.get("eiraku").expect("species exists");

    let err = create_creature(
        species,
        CreateCreatureOptions {
            moves: Some(vec!["not_a_move".to_string()]),
            ..Default::default()
        },
        &learnsets,
        &move_db,
    )
    .expect_err("should fail");

    assert!(err.contains("Unknown move id"));
}
