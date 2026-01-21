import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Swords, Users, BookOpen, ChevronRight } from 'lucide-react';
import { loadSpecies, getTypeColor } from '../lib/data';
import type { SpeciesData, Species } from '../types/pokemon';

export default function HomePage() {
    const [species, setSpecies] = useState<SpeciesData>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSpecies().then((data) => {
            setSpecies(data);
            setLoading(false);
        });
    }, []);

    const speciesList = Object.values(species);

    return (
        <div className="min-h-dvh bg-[var(--surface-1)]">
            {/* Header */}
            <header className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-[var(--text-primary)]">Nikipoke</h1>
                    <span className="text-sm text-[var(--text-muted)]">ようこそ、トレーナー！</span>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-10 space-y-12">
                {/* Battle Mode Cards */}
                <section>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">バトルモード</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* VS AI */}
                        <Link
                            to="/deck-builder?mode=ai"
                            className="group bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5
                                hover:border-[var(--border-hover)] hover:bg-[var(--surface-3)]
                                transition-all duration-150 card-hover"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[var(--accent-muted)] rounded-lg">
                                    <Swords className="size-6 text-[var(--accent)]" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-base font-semibold text-[var(--text-primary)]">VS AI</h3>
                                    <p className="text-sm text-[var(--text-muted)]">AIとバトルする</p>
                                </div>
                                <ChevronRight className="size-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                            </div>
                        </Link>

                        {/* VS Player (Coming Soon) */}
                        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5 opacity-50 cursor-not-allowed">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[var(--surface-3)] rounded-lg">
                                    <Users className="size-6 text-[var(--text-muted)]" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-base font-semibold text-[var(--text-muted)]">VS Player</h3>
                                    <p className="text-sm text-[var(--text-muted)]">Coming Soon...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Pokemon List */}
                <section>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <BookOpen className="size-5" />
                            ポケモン図鑑
                        </h2>
                        <span className="text-sm text-[var(--text-muted)] tabular-nums">{speciesList.length}匹</span>
                    </div>

                    {loading ? (
                        <div className="text-center py-16 text-[var(--text-muted)]">読み込み中...</div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            {speciesList.map((mon) => (
                                <PokemonCard key={mon.id} species={mon} />
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

function PokemonCard({ species }: { species: Species }) {
    // Find the highest stat to highlight
    const stats = species.baseStats;
    const maxStat = Math.max(stats.hp, stats.atk, stats.def, stats.spa, stats.spd, stats.spe);

    return (
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5 
            hover:border-[var(--border-hover)] hover:bg-[var(--surface-3)] transition-all duration-150 card-hover">
            {/* Name */}
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">{species.name}</h3>

            {/* Types */}
            <div className="flex gap-1.5 mb-4">
                {species.type.map((t) => (
                    <span
                        key={t}
                        className="px-2.5 py-1 text-xs font-medium text-white rounded-md"
                        style={{ backgroundColor: getTypeColor(t) }}
                    >
                        {t}
                    </span>
                ))}
            </div>

            {/* Base Stats Preview */}
            <div className="space-y-2">
                <StatBar label="H" value={stats.hp} max={255} isMax={stats.hp === maxStat} />
                <StatBar label="A" value={stats.atk} max={255} isMax={stats.atk === maxStat} />
                <StatBar label="B" value={stats.def} max={255} isMax={stats.def === maxStat} />
                <StatBar label="C" value={stats.spa} max={255} isMax={stats.spa === maxStat} />
                <StatBar label="D" value={stats.spd} max={255} isMax={stats.spd === maxStat} />
                <StatBar label="S" value={stats.spe} max={255} isMax={stats.spe === maxStat} />
            </div>
        </div>
    );
}

function StatBar({ label, value, max, isMax }: { label: string; value: number; max: number; isMax: boolean }) {
    const percentage = (value / max) * 100;
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className={`w-4 tabular-nums ${isMax ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                {label}
            </span>
            <div className="flex-1 h-1.5 bg-[var(--surface-4)] rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${isMax ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className={`w-7 text-right tabular-nums ${isMax ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
                {value}
            </span>
        </div>
    );
}
