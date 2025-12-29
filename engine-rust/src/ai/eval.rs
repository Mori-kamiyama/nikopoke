use crate::core::state::BattleState;

pub fn evaluate_state(state: &BattleState, player_id: &str) -> f32 {
    let mut score = 0.0;
    for player in &state.players {
        let total_hp: i32 = player.team.iter().map(|c| c.hp.max(0)).sum();
        if player.id == player_id {
            score += total_hp as f32;
        } else {
            score -= total_hp as f32;
        }
    }
    score
}
