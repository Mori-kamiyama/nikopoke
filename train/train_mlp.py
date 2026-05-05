import json
import os
import random
import subprocess
import tempfile
from pathlib import Path

import numpy as np


POPULATION_SIZE = 50
GENERATIONS = 100
GAMES_PER_MATCH = 20
SURVIVORS = 10
MUTATION_SCALE = 0.05
TRAIN_DIR = Path(__file__).resolve().parent
BINARY_PATH = TRAIN_DIR.parent / "engine-rust/target/release/self-play-export"
OUTPUT_PATH = TRAIN_DIR.parent / "frontend/public/ai_weights.json"

W1 = (64, 44)
B1 = (64,)
W2 = (32, 64)
B2 = (32,)
W3 = (6, 32)
B3 = (6,)


def random_weights(scale=0.1):
    return {
        "w1": np.random.randn(*W1) * scale,
        "b1": np.zeros(B1),
        "w2": np.random.randn(*W2) * scale,
        "b2": np.zeros(B2),
        "w3": np.random.randn(*W3) * scale,
        "b3": np.zeros(B3),
    }


def weights_to_jsonable(weights):
    return {key: value.tolist() for key, value in weights.items()}


def save_weights(weights, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(weights_to_jsonable(weights), f, separators=(",", ":"))


def ensure_placeholder_weights():
    if OUTPUT_PATH.exists():
        return

    state = np.random.get_state()
    np.random.seed(42)
    save_weights(random_weights(scale=0.1), OUTPUT_PATH)
    np.random.set_state(state)


def evaluate_pair(weights_a, weights_b, games, seed_offset):
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        path_a = temp_path / "wa.json"
        path_b = temp_path / "wb.json"
        save_weights(weights_a, path_a)
        save_weights(weights_b, path_b)

        result = subprocess.run(
            [
                str(BINARY_PATH),
                "--weight-a",
                str(path_a),
                "--weight-b",
                str(path_b),
                "--games",
                str(games),
                "--seed",
                str(seed_offset),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        parsed = json.loads(result.stdout)
        return parsed["wins_a"], parsed["wins_b"]


def tournament(population):
    scores = [0 for _ in population]

    for index, weights in enumerate(population):
        opponent_indexes = list(range(len(population)))
        opponent_indexes.remove(index)
        for match_no, opponent_index in enumerate(random.sample(opponent_indexes, 3)):
            wins_a, _wins_b = evaluate_pair(
                weights,
                population[opponent_index],
                GAMES_PER_MATCH,
                seed_offset=42 + index * 1000 + match_no * 100 + opponent_index,
            )
            scores[index] += wins_a

    return sorted(zip(scores, population), key=lambda item: item[0], reverse=True)


def mutate(parent):
    return {
        key: value + np.random.randn(*value.shape) * MUTATION_SCALE
        for key, value in parent.items()
    }


def evolve(survivors):
    next_population = [copy_weights(weights) for weights in survivors]

    while len(next_population) < POPULATION_SIZE:
        parent = random.choice(survivors)
        next_population.append(mutate(parent))

    return next_population


def copy_weights(weights):
    return {key: value.copy() for key, value in weights.items()}


def main():
    ensure_placeholder_weights()
    np.random.seed(42)
    random.seed(42)

    if not os.path.exists(BINARY_PATH):
        raise FileNotFoundError(
            f"{BINARY_PATH} not found. Build it first with: cargo build --release --bin self-play-export"
        )

    population = [random_weights() for _ in range(POPULATION_SIZE)]
    best_weights = copy_weights(population[0])

    for generation in range(1, GENERATIONS + 1):
        ranked = tournament(population)
        best_score, best_weights = ranked[0]
        total_games = 3 * GAMES_PER_MATCH
        print(f"Generation {generation}/{GENERATIONS}: {best_score}/{total_games} wins")

        survivors = [weights for _, weights in ranked[:SURVIVORS]]
        population = evolve(survivors)

    save_weights(best_weights, OUTPUT_PATH)


if __name__ == "__main__":
    main()
