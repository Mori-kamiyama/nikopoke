import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Home, RotateCcw } from 'lucide-react';

interface BattleResult {
    winner: string;
    logs: string[];
}

export default function ResultPage() {
    const navigate = useNavigate();
    const [result, setResult] = useState<BattleResult | null>(null);

    useEffect(() => {
        const resultJson = sessionStorage.getItem('battleResult');
        if (!resultJson) {
            navigate('/home');
            return;
        }
        setResult(JSON.parse(resultJson));
    }, [navigate]);

    if (!result) {
        return (
            <div className="min-h-dvh bg-[var(--surface-1)] flex items-center justify-center">
                <div className="text-[var(--text-muted)] text-lg">読み込み中...</div>
            </div>
        );
    }

    const isVictory = result.winner === 'player';

    return (
        <div className="min-h-dvh bg-[var(--surface-0)] bg-grid-pattern flex flex-col items-center justify-center p-6">
            {/* Result Card */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-md w-full">
                {/* Trophy Icon */}
                <div className={`mx-auto size-20 rounded-full flex items-center justify-center mb-6
                    ${isVictory ? 'bg-amber-500/20' : 'bg-[var(--surface-3)]'}`}
                >
                    <Trophy className={`size-10 ${isVictory ? 'text-amber-400' : 'text-[var(--text-muted)]'}`} />
                </div>

                {/* Result Text */}
                <h1 className={`text-balance text-4xl font-black mb-2
                    ${isVictory ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}
                >
                    {isVictory ? 'VICTORY!' : 'DEFEAT...'}
                </h1>
                <p className="text-[var(--text-secondary)] mb-8">
                    {isVictory ? 'おめでとう！勝利しました！' : '残念、敗北しました...'}
                </p>

                {/* Battle Log Summary */}
                <div className="bg-[var(--surface-3)] rounded-xl p-4 mb-6 max-h-48 overflow-y-auto text-left">
                    <h3 className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wide">バトルログ</h3>
                    {result.logs.slice(-10).map((log, i) => (
                        <p key={i} className="text-xs text-[var(--text-secondary)] py-1.5 border-b border-[var(--border)] last:border-0">
                            {log}
                        </p>
                    ))}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={() => {
                            sessionStorage.removeItem('battleResult');
                            navigate('/deck-builder?mode=ai');
                        }}
                        className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2
                            bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] 
                            shadow-lg shadow-[var(--accent)]/20 transition-all"
                    >
                        <RotateCcw className="size-5" />
                        もう一度バトル
                    </button>
                    <button
                        onClick={() => {
                            sessionStorage.removeItem('battleResult');
                            sessionStorage.removeItem('playerDeck');
                            navigate('/home');
                        }}
                        className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2
                            bg-[var(--surface-3)] text-[var(--text-primary)] hover:bg-[var(--surface-4)] transition-all"
                    >
                        <Home className="size-5" />
                        ホームに戻る
                    </button>
                </div>
            </div>
        </div>
    );
}
