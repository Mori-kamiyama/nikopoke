import type { DeckPokemon } from '../types/pokemon';

const STORAGE_KEY = 'battleRecords';

export type BattleRecordPokemon = {
    speciesId: string;
    moves: string[];
};

export type BattleRecord = {
    id: string;
    createdAt: string;
    winner: string | null;
    localPlayerId: string;
    opponentPlayerId: string;
    mode: string;
    playerTeam: BattleRecordPokemon[];
    opponentTeam: BattleRecordPokemon[];
};

export function deckToRecordTeam(deck: DeckPokemon[] | null | undefined): BattleRecordPokemon[] {
    if (!deck) return [];

    return deck.map((pokemon) => ({
        speciesId: pokemon.speciesId,
        moves: pokemon.moves.filter(Boolean),
    }));
}

export function createBattleRecord(args: {
    winner: string | null;
    localPlayerId: string;
    opponentPlayerId: string;
    mode: string;
    playerDeck: DeckPokemon[] | null | undefined;
    opponentDeck: DeckPokemon[] | null | undefined;
}): BattleRecord {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        winner: args.winner,
        localPlayerId: args.localPlayerId,
        opponentPlayerId: args.opponentPlayerId,
        mode: args.mode,
        playerTeam: deckToRecordTeam(args.playerDeck),
        opponentTeam: deckToRecordTeam(args.opponentDeck),
    };
}

export function loadBattleRecords(): BattleRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveBattleRecord(record: BattleRecord) {
    const records = loadBattleRecords();
    records.unshift(record);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 300)));
}

export type PokemonUsageStats = {
    speciesId: string;
    used: number;
    wins: number;
    losses: number;
    winRate: number;
    moves: {
        name: string;
        rate: number;
    }[];
};

export function aggregatePokemonUsage(records: BattleRecord[]): Record<string, PokemonUsageStats> {
    const bySpecies = new Map<
        string,
        {
            used: number;
            wins: number;
            losses: number;
            moveCounts: Map<string, number>;
        }
    >();

    for (const record of records) {
        const sides = [
            {
                team: record.playerTeam,
                won: record.winner === record.localPlayerId,
            },
            {
                team: record.opponentTeam,
                won: record.winner === record.opponentPlayerId,
            },
        ];

        for (const side of sides) {
            const uniqueSpeciesIds = new Set(side.team.map((pokemon) => pokemon.speciesId));

            for (const speciesId of uniqueSpeciesIds) {
                const current =
                    bySpecies.get(speciesId) ?? {
                        used: 0,
                        wins: 0,
                        losses: 0,
                        moveCounts: new Map<string, number>(),
                    };

                current.used += 1;

                if (side.won) {
                    current.wins += 1;
                } else {
                    current.losses += 1;
                }

                const pokemon = side.team.find((member) => member.speciesId === speciesId);
                if (pokemon) {
                    for (const moveId of new Set(pokemon.moves)) {
                        current.moveCounts.set(moveId, (current.moveCounts.get(moveId) ?? 0) + 1);
                    }
                }

                bySpecies.set(speciesId, current);
            }
        }
    }

    return Object.fromEntries(
        [...bySpecies.entries()].map(([speciesId, stats]) => {
            const moves = [...stats.moveCounts.entries()]
                .map(([name, count]) => ({
                    name,
                    rate: stats.used > 0 ? (count / stats.used) * 100 : 0,
                }))
                .sort((a, b) => b.rate - a.rate)
                .slice(0, 8);

            return [
                speciesId,
                {
                    speciesId,
                    used: stats.used,
                    wins: stats.wins,
                    losses: stats.losses,
                    winRate: stats.used > 0 ? (stats.wins / stats.used) * 100 : 0,
                    moves,
                },
            ];
        }),
    );
}