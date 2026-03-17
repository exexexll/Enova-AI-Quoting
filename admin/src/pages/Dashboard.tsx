import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';
import type { DashboardStats, Session, Contract } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const responses = await Promise.all([
          fetch(`${API}/api/sessions?limit=1000`),
          fetch(`${API}/api/ingredients?per_page=1&page=1`),
          fetch(`${API}/api/escalations?status=pending`),
          fetch(`${API}/api/contracts`),
        ]);
        for (const r of responses) {
          if (!r.ok) throw new Error(`HTTP ${r.status} from ${r.url}`);
        }
        const [sessions, ingredients, escalations, contracts] = await Promise.all(
          responses.map(r => r.json())
        );
        const sessArr: Session[] = Array.isArray(sessions) ? sessions : [];
        const ctrArr: Contract[] = Array.isArray(contracts) ? contracts : [];
        setStats({
          totalSessions: sessArr.length,
          activeSessions: sessArr.filter(s => s.status === 'active').length,
          totalIngredients: ingredients?.total ?? 0,
          pendingEscalations: Array.isArray(escalations) ? escalations.length : 0,
          contracts: ctrArr.length,
          submittedContracts: ctrArr.filter(c => c.status === 'submitted').length,
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
        setError('Failed to load dashboard data. Is the backend running?');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = [
    { label: 'Total Ingredients', value: stats?.totalIngredients?.toLocaleString() ?? '...', color: 'bg-blue-500' },
    { label: 'Active Sessions', value: String(stats?.activeSessions ?? '...'), color: 'bg-green-500' },
    { label: 'Pending Escalations', value: String(stats?.pendingEscalations ?? '...'), color: 'bg-amber-500' },
    { label: 'Submitted Contracts', value: String(stats?.submittedContracts ?? '...'), color: 'bg-purple-500' },
  ];

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Dashboard</h2>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
      )}
      {loading ? (
        <div className="text-sm text-gray-400">Loading dashboard...</div>
      ) : (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {cards.map(c => (
            <div key={c.label} className="bg-white rounded-lg shadow-sm p-5">
              <div className={`w-10 h-10 ${c.color} rounded-lg flex items-center justify-center text-white text-lg mb-3`}>
                {c.value === '...' ? '...' : c.value}
              </div>
              <div className="text-2xl font-bold text-gray-800">{c.value}</div>
              <div className="text-sm text-gray-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
