// Engine wrapper for browser WASM integration
import init, {
    createBattleState as wasmCreateBattleState,
    createCreature as wasmCreateCreature,
    stepBattle as wasmStepBattle,
    getBestMoveMCTS as wasmGetBestMoveMCTS,
    getBestMoveMinimax as wasmGetBestMoveMinimax,
    isBattleOver as wasmIsBattleOver,
} from './engine-rust/engine_rust.js';

import type { DeckPokemon } from '../types/pokemon';

// WASM initialization state
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

export async function initEngine(): Promise<void> {
    if (wasmInitialized) return;
    if (wasmInitPromise) return wasmInitPromise;

    wasmInitPromise = (async () => {
        await init();
        wasmInitialized = true;
    })();

    return wasmInitPromise;
}

// Types matching WASM wire format
export interface CreatureStateWire {
    id: string;
    speciesId: string;
    name: string;
    level: number;
    types: string[];
    moves: string[];
    ability: string | null;
    item: string | null;
    hp: number;
    maxHp: number;
    stages: { atk: number; def: number; spa: number; spd: number; spe: number; accuracy: number; evasion: number };
    statuses: { id: string; remainingTurns: number | null }[];
    movePp: { [moveId: string]: number };
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
}

export interface PlayerStateWire {
    id: string;
    name: string;
    team: CreatureStateWire[];
    activeSlot: number;
}

export interface FieldStateWire {
    global: { id: string; remainingTurns: number | null }[];
    sides: { [playerId: string]: { id: string; remainingTurns: number | null }[] };
}

export interface BattleStateWire {
    players: PlayerStateWire[];
    field: FieldStateWire;
    turn: number;
    log: string[];
}

export interface ActionWire {
    type: 'move' | 'switch';
    playerId: string;
    moveId?: string;
    targetId?: string;
    slot?: number;
}

// Initialize and create battle state
export async function createBattleState(playerDecks: {
    [playerId: string]: { team: DeckPokemon[] }
}): Promise<BattleStateWire> {
    await initEngine();

    // Create creatures for each player
    const players: PlayerStateWire[] = [];

    for (const [playerId, playerData] of Object.entries(playerDecks)) {
        const team: CreatureStateWire[] = [];

        for (const pokemon of playerData.team) {
            const creature = wasmCreateCreature(pokemon.speciesId, {
                moves: pokemon.moves,
                ability: pokemon.ability,
                evs: pokemon.evs,
            });
            team.push(creature);
        }

        players.push({
            id: playerId,
            name: playerId,
            team,
            activeSlot: 0,
        });
    }

    return wasmCreateBattleState(players);
}

export async function stepBattle(
    state: BattleStateWire,
    actions: ActionWire[]
): Promise<BattleStateWire> {
    await initEngine();
    return wasmStepBattle(state, actions, { recordHistory: false });
}

export async function getBestMoveMCTS(
    state: BattleStateWire,
    playerId: string,
    iterations: number = 100
): Promise<ActionWire | null> {
    await initEngine();
    return wasmGetBestMoveMCTS(state, playerId, iterations);
}

export async function getBestMoveMinimax(
    state: BattleStateWire,
    playerId: string,
    depth: number = 3
): Promise<ActionWire | null> {
    await initEngine();
    return wasmGetBestMoveMinimax(state, playerId, depth);
}

export async function isBattleOver(state: BattleStateWire): Promise<boolean> {
    await initEngine();
    return wasmIsBattleOver(state);
}

// Helper to check winner
export function getWinner(state: BattleStateWire): string | null {
    for (const player of state.players) {
        const allFainted = player.team.every(c => c.hp <= 0);
        if (allFainted) {
            // Return the OTHER player's ID as winner
            const winner = state.players.find(p => p.id !== player.id);
            return winner?.id || null;
        }
    }
    return null;
}
