import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

interface Entry { name: string; batch: string; gold: number; silver: number; bronze: number; wins: number; ratingGain: number; total: number }

const MEDAL_SCORE = { Gold: 10, Silver: 6, Bronze: 3, Participation: 1, 'Best Game': 2, None: 0 };

export function Leaderboard() {
  const { token, logout } = useAuth();
  const [board, setBoard] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const rows = await readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:Q`);
        const map = new Map<string, Entry>();
        rows.slice(1).filter(r => r[1]?.trim()).forEach(r => {
          const name = r[1].trim(); const batch = r[2] ?? '';
          const medal = r[16]?.trim() ?? 'None';
          const wins  = parseInt(r[9] ?? '0') || 0;
          const ratingChange = parseFloat(r[15] ?? '0') || 0;
          if (!map.has(name)) map.set(name, { name, batch, gold:0, silver:0, bronze:0, wins:0, ratingGain:0, total:0 });
          const e = map.get(name)!;
          if (medal === 'Gold') e.gold++;
          else if (medal === 'Silver') e.silver++;
          else if (medal === 'Bronze') e.bronze++;
          e.wins += wins;
          e.ratingGain += ratingChange;
          e.total += MEDAL_SCORE[medal as keyof typeof MEDAL_SCORE] ?? 0;
        });
        setBoard([...map.values()].sort((a, b) => b.total - a.total || b.gold - a.gold || b.silver - a.silver || b.wins - a.wins));
      } catch (e: any) { if (e.message === 'TOKEN_EXPIRED') { logout(); return; } setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token, logout]);

  if (loading) return <Layout title="Leaderboard"><Spinner /></Layout>;

  return (
    <Layout title="🏆 Leaderboard" showBack>
      <div className="p-4 space-y-2">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        {board.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">🏆</p>
            <p>No tournament results yet.</p>
          </div>
        )}
        {board.map((e, i) => (
          <div key={e.name} className={`flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm border
            ${i===0?'border-yellow-300 bg-yellow-50':i===1?'border-gray-300 bg-gray-50':i===2?'border-orange-200 bg-orange-50':'border-gray-100'}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0
              ${i===0?'bg-yellow-400 text-white':i===1?'bg-gray-400 text-white':i===2?'bg-orange-400 text-white':'bg-gray-100 text-gray-600'}`}>
              {i < 3 ? ['🥇','🥈','🥉'][i] : i+1}
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900">{e.name}</p>
              <p className="text-xs text-gray-500">{e.batch}</p>
            </div>
            <div className="text-right">
              <div className="flex gap-2 text-sm justify-end">
                {e.gold>0 && <span>🥇{e.gold}</span>}
                {e.silver>0 && <span>🥈{e.silver}</span>}
                {e.bronze>0 && <span>🥉{e.bronze}</span>}
              </div>
              <p className="text-xs text-gray-400">{e.wins} wins · {e.ratingGain>=0?'+':''}{e.ratingGain.toFixed(0)} rating</p>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
