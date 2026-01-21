import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { cn } from '../lib/cn';
import { loadAllData, getTypeColor } from '../lib/data';
import { BattleLog, ActionSummary } from '../components/BattleLog';
import {
    initEngine,
    createBattleState,
    stepBattle,
    getBestMoveMinimax,
    isBattleOver,
    getWinner,
    type BattleStateWire,
    type PlayerStateWire,
    type CreatureStateWire,
    type ActionWire
} from '../lib/engine';
import type { SpeciesData, MoveData, DeckPokemon } from '../types/pokemon';

export default function BattlePage() {
    const navigate = useNavigate();
    const [species, setSpecies] = useState<SpeciesData>({});
    const [moves, setMoves] = useState<MoveData>({});
    const [battleState, setBattleState] = useState<BattleStateWire | null>(null);
    const [loading, setLoading] = useState(true);
    const [waiting, setWaiting] = useState(false);
    const [showSwitchMenu, setShowSwitchMenu] = useState(false);
    const [lastMoves, setLastMoves] = useState<{ player?: string; ai?: string }>({});
    const logsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const init = async () => {
            // Initialize WASM engine
            await initEngine();

            const { species, moves } = await loadAllData();
            setSpecies(species);
            setMoves(moves);

            // Get player deck from session storage
            const deckJson = sessionStorage.getItem('playerDeck');
            if (!deckJson) {
                navigate('/home');
                return;
            }

            const playerDeck: DeckPokemon[] = JSON.parse(deckJson);

            // Create AI deck (random selection)
            const speciesList = Object.values(species);
            const aiDeck: DeckPokemon[] = [];
            const usedIds = new Set(playerDeck.map(p => p.speciesId));

            for (let i = 0; i < 3; i++) {
                const available = speciesList.filter(s => !usedIds.has(s.id));
                const randomSpecies = available[Math.floor(Math.random() * available.length)];
                usedIds.add(randomSpecies.id);

                aiDeck.push({
                    speciesId: randomSpecies.id,
                    moves: playerDeck[0].moves.slice(0, 4),
                    ability: randomSpecies.abilities[0] || 'none',
                });
            }

            // Initialize battle using WASM
            const state = await createBattleState({
                player: { team: playerDeck },
                ai: { team: aiDeck },
            });

            setBattleState(state);
            setLoading(false);
        };

        init().catch(err => {
            console.error('Failed to initialize battle:', err);
            setLoading(false);
        });
    }, [navigate]);

    useEffect(() => {
        // Scroll to bottom of logs
        if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
    }, [battleState?.log]);

    const getPlayer = (id: string): PlayerStateWire | undefined => {
        return battleState?.players.find(p => p.id === id);
    };

    const handleSelectMove = async (moveId: string) => {
        if (!battleState || waiting) return;
        setWaiting(true);
        setShowSwitchMenu(false);

        try {
            // Player action
            const playerAction: ActionWire = {
                type: 'move',
                playerId: 'player',
                moveId,
                targetId: 'ai'
            };

            // AI action using Minimax (depth 1 for speed)
            const aiAction = await getBestMoveMinimax(battleState, 'ai', 1);

            if (!aiAction) {
                console.error('AI failed to select action');
                setWaiting(false);
                return;
            }

            // Step battle
            const newState = await stepBattle(battleState, [playerAction, aiAction]);

            // Track last moves
            setLastMoves({
                player: moveId,
                ai: aiAction.moveId || undefined
            });

            setBattleState(newState);

            // Check if battle is over
            const over = await isBattleOver(newState);
            if (over) {
                setTimeout(() => {
                    const winner = getWinner(newState);
                    sessionStorage.setItem('battleResult', JSON.stringify({
                        winner,
                        logs: newState.log,
                    }));
                    navigate('/result');
                }, 1500);
            }
        } catch (err) {
            console.error('Battle step error:', err);
        }

        setWaiting(false);
    };

    const handleSwitch = async (index: number) => {
        if (!battleState || waiting) return;
        const player = getPlayer('player');
        if (!player) return;
        if (index === player.activeSlot) return;
        if (player.team[index].hp <= 0) return;

        setWaiting(true);
        setShowSwitchMenu(false);

        try {
            const playerAction: ActionWire = {
                type: 'switch',
                playerId: 'player',
                slot: index
            };

            const aiAction = await getBestMoveMinimax(battleState, 'ai', 1);

            if (!aiAction) {
                console.error('AI failed to select action');
                setWaiting(false);
                return;
            }

            const newState = await stepBattle(battleState, [playerAction, aiAction]);
            setBattleState(newState);

            // Track AI's move after switch
            setLastMoves(prev => ({
                ...prev,
                ai: aiAction.moveId || undefined
            }));
        } catch (err) {
            console.error('Switch error:', err);
        }

        setWaiting(false);
    };

    if (loading || !battleState) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-[var(--surface-1)]">
                <div className="text-lg text-[var(--text-muted)]">バトル準備中...</div>
            </div>
        );
    }

    const player = getPlayer('player')!;
    const ai = getPlayer('ai')!;
    const playerPokemon = player.team[player.activeSlot];
    const aiPokemon = ai.team[ai.activeSlot];
    const playerSpecies = species[playerPokemon.speciesId];
    const aiSpecies = species[aiPokemon.speciesId];

    // Get last move objects
    const playerLastMove = lastMoves.player ? moves[lastMoves.player] : undefined;
    const aiLastMove = lastMoves.ai ? moves[lastMoves.ai] : undefined;

    return (
        <div className="flex min-h-dvh flex-col bg-[var(--surface-1)]">
            {/* Header */}
            <header className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/home')}
                            className="rounded-lg p-2 transition-colors hover:bg-[var(--surface-3)]"
                            aria-label="ホームに戻る"
                        >
                            <ArrowLeft className="size-5 text-[var(--text-muted)]" />
                        </button>
                        <span className="font-medium tabular-nums text-[var(--text-primary)]">ターン {battleState.turn}</span>
                    </div>
                    <span className="text-sm text-[var(--text-muted)]">VS AI (Minimax)</span>
                </div>
            </header>

            {/* Battle Field */}
            <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6">
                {/* AI Pokemon + Team Indicator */}
                <div className="flex items-start gap-4">
                    <TeamIndicator team={ai.team} activeSlot={ai.activeSlot} species={species} isPlayer={false} />
                    <PokemonStatus
                        creature={aiPokemon}
                        species={aiSpecies}
                        isPlayer={false}
                        moves={moves}
                    />
                </div>

                {/* Action Summary - Shows last turn's moves */}
                <ActionSummary
                    playerMove={playerLastMove ? { name: playerLastMove.name, type: playerLastMove.type } : undefined}
                    aiMove={aiLastMove ? { name: aiLastMove.name, type: aiLastMove.type } : undefined}
                    getTypeColor={getTypeColor}
                />

                {/* Battle Logs */}
                <div ref={logsRef}>
                    <BattleLog
                        logs={battleState.log}
                        currentTurn={battleState.turn}
                    />
                </div>

                {/* Player Pokemon + Team Indicator */}
                <div className="flex items-end gap-4">
                    <TeamIndicator team={player.team} activeSlot={player.activeSlot} species={species} isPlayer={true} />
                    <PokemonStatus
                        creature={playerPokemon}
                        species={playerSpecies}
                        isPlayer={true}
                        moves={moves}
                    />
                </div>

                {/* Action Buttons */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    {showSwitchMenu ? (
                        <div>
                            <div className="mb-3 flex items-center justify-between">
                                <span className="font-medium text-[var(--text-primary)]">ポケモンを交代</span>
                                <button
                                    onClick={() => setShowSwitchMenu(false)}
                                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                    戻る
                                </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {player.team.map((mon, idx) => {
                                    const monSpecies = species[mon.speciesId];
                                    const isActive = idx === player.activeSlot;
                                    const isFainted = mon.hp <= 0;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => handleSwitch(idx)}
                                            disabled={isActive || isFainted || waiting}
                                            className={cn(
                                                'rounded-xl border p-3 text-left transition-all',
                                                isActive
                                                    ? 'border-[var(--accent)]/50 bg-[var(--accent-muted)]'
                                                    : isFainted
                                                        ? 'cursor-not-allowed border-red-500/30 bg-red-900/10 opacity-50'
                                                        : 'border-[var(--border)] bg-[var(--surface-3)] hover:border-[var(--border-hover)]'
                                            )}
                                        >
                                            <div className="text-sm font-medium text-[var(--text-primary)]">{monSpecies?.name}</div>
                                            <div className="text-xs tabular-nums text-[var(--text-muted)]">
                                                HP: {mon.hp}/{mon.maxHp}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="mb-3 grid grid-cols-2 gap-2">
                                {playerPokemon.moves.map((moveId) => {
                                    const move = moves[moveId];
                                    const pp = playerPokemon.movePp[moveId] ?? 10;
                                    return (
                                        <button
                                            key={moveId}
                                            onClick={() => handleSelectMove(moveId)}
                                            disabled={waiting || pp === 0}
                                            className={cn(
                                                'rounded-xl border p-3 transition-all',
                                                waiting || pp === 0
                                                    ? 'cursor-not-allowed border-[var(--border)] bg-[var(--surface-3)] opacity-50'
                                                    : 'border-[var(--border)] bg-[var(--surface-3)] hover:border-[var(--border-hover)] hover:bg-[var(--accent-muted)]'
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="rounded-md px-2 py-0.5 text-xs text-white"
                                                    style={{ backgroundColor: getTypeColor(move?.type || 'normal') }}
                                                >
                                                    {move?.type}
                                                </span>
                                                <span className="font-medium text-[var(--text-primary)]">{move?.name || moveId}</span>
                                            </div>
                                            <div className="mt-1 flex gap-3 text-xs tabular-nums text-[var(--text-muted)]">
                                                <span>威力: {move?.power || '-'}</span>
                                                <span>PP: {pp}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => setShowSwitchMenu(true)}
                                disabled={waiting}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-3)] p-3 text-[var(--text-primary)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-4)]"
                            >
                                <RotateCcw className="size-4" />
                                ポケモン交代
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// Team indicator showing remaining pokemon HP
function TeamIndicator({
    team,
    activeSlot,
    species,
    isPlayer
}: {
    team: CreatureStateWire[];
    activeSlot: number;
    species: SpeciesData;
    isPlayer: boolean;
}) {
    return (
        <div className={cn(
            'flex flex-col gap-1',
            isPlayer ? 'items-end' : 'items-start'
        )}>
            {team.map((mon, idx) => {
                const hpPercent = mon.maxHp > 0 ? (mon.hp / mon.maxHp) * 100 : 0;
                const isActive = idx === activeSlot;
                const isFainted = mon.hp <= 0;
                const monSpecies = species[mon.speciesId];

                return (
                    <div
                        key={idx}
                        className={cn(
                            'flex items-center gap-2 rounded-full px-2 py-1 text-xs',
                            isActive ? 'bg-[var(--accent-muted)]' : 'bg-[var(--surface-3)]'
                        )}
                        title={`${monSpecies?.name}: ${mon.hp}/${mon.maxHp} HP`}
                    >
                        <span className={cn(
                            'size-2 rounded-full',
                            isFainted ? 'bg-red-500' : isActive ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'
                        )} />
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--surface-4)]">
                            <div
                                className={cn(
                                    'h-full transition-all',
                                    hpPercent > 50 ? 'bg-emerald-500' : hpPercent > 20 ? 'bg-amber-500' : 'bg-red-500'
                                )}
                                style={{ width: `${hpPercent}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function PokemonStatus({
    creature,
    species,
    isPlayer,
    moves: _moves
}: {
    creature: CreatureStateWire;
    species: SpeciesData[string] | undefined;
    isPlayer: boolean;
    moves: MoveData;
}) {
    const hpPercentage = creature.maxHp > 0 ? (creature.hp / creature.maxHp) * 100 : 0;
    const hpColor = hpPercentage > 50 ? 'bg-emerald-500' : hpPercentage > 20 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div className={cn('flex-1', isPlayer ? 'text-right' : 'text-left')}>
            <div className="inline-block min-w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className={cn('flex items-center gap-3', isPlayer ? 'flex-row-reverse' : '')}>
                    <div className="text-3xl">
                        {isPlayer ? '🔵' : '🔴'}
                    </div>
                    <div className={isPlayer ? 'text-right' : ''}>
                        <h3 className="text-balance text-lg font-bold text-[var(--text-primary)]">{species?.name || creature.name}</h3>
                        <div className={cn('flex gap-1', isPlayer ? 'justify-end' : '')}>
                            {(creature.types || species?.type || []).map((t) => (
                                <span
                                    key={t}
                                    className="rounded-md px-1.5 py-0.5 text-xs text-white"
                                    style={{ backgroundColor: getTypeColor(t) }}
                                >
                                    {t}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* HP Bar */}
                <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
                        <span>HP</span>
                        <span className="tabular-nums">{creature.hp}/{creature.maxHp}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-4)]">
                        <div
                            className={cn('h-full transition-all duration-300', hpColor)}
                            style={{ width: `${hpPercentage}%` }}
                        />
                    </div>
                </div>

                {/* Stat Stages */}
                {(() => {
                    const stages = creature.stages;
                    const displayStages: { label: string; value: number }[] = [];
                    if (stages.atk !== 0) displayStages.push({ label: 'Atk', value: stages.atk });
                    if (stages.def !== 0) displayStages.push({ label: 'Def', value: stages.def });
                    if (stages.spa !== 0) displayStages.push({ label: 'SpA', value: stages.spa });
                    if (stages.spd !== 0) displayStages.push({ label: 'SpD', value: stages.spd });
                    if (stages.spe !== 0) displayStages.push({ label: 'Spe', value: stages.spe });

                    return displayStages.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {displayStages.map(({ label, value }) => (
                                <span
                                    key={label}
                                    className={cn(
                                        'rounded px-2 py-0.5 text-xs font-medium tabular-nums text-white',
                                        value > 0 ? 'bg-green-600' : 'bg-red-600'
                                    )}
                                >
                                    {value > 0 ? '+' : ''}{value} {label}
                                </span>
                            ))}
                        </div>
                    );
                })()}

                {/* Status */}
                {creature.statuses && creature.statuses.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {creature.statuses.map((status, i) => (
                            <span key={i} className="rounded bg-purple-600 px-2 py-0.5 text-xs text-white">
                                {status.id}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
