import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';
import type { Escalation } from '../types';

export default function RequestQueue() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [resolvedItems, setResolvedItems] = useState<Escalation[]>([]);
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    try {
      const resp = await fetch(`${API}/api/escalations?status=${tab}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (tab === 'pending') setItems(Array.isArray(data) ? data : []);
      else setResolvedItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load escalations:', err);
    }
  };

  const resolve = async (id: number) => {
    const price = prompt('Enter confirmed price per gram (USD):');
    if (!price) return;
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed <= 0) {
      alert('Please enter a valid positive number.');
      return;
    }
    const notes = prompt('Admin notes (optional):') || '';
    try {
      const resp = await fetch(`${API}/api/escalations/${id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed_price: parsed, admin_notes: notes }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      console.error('Failed to resolve escalation:', err);
      alert('Failed to resolve. Check the backend connection.');
    }
    load();
  };

  const current = tab === 'pending' ? items : resolvedItems;

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Escalation Queue</h2>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('pending')}
          className={`text-sm px-4 py-1.5 rounded-lg ${tab === 'pending' ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-700'}`}>
          Pending ({items.length})
        </button>
        <button onClick={() => setTab('resolved')}
          className={`text-sm px-4 py-1.5 rounded-lg ${tab === 'resolved' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}>
          Resolved
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Ingredient</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Source</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Client</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Session</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500">Est. Range</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Date</th>
              <th className="text-center px-4 py-2 text-xs text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {current.map((item: any) => (
              <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{item.item_requested}</td>
                <td className="px-4 py-3 text-gray-500">{item.source}</td>
                <td className="px-4 py-3 text-gray-500">{item.client_name || '-'}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.session_id}</td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {item.est_low && item.est_high ? `$${item.est_low.toFixed(4)} – $${item.est_high.toFixed(4)}` : '-'}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(item.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-center">
                  {tab === 'pending' ? (
                    <button onClick={() => resolve(item.id)}
                      className="bg-green-600 text-white text-xs px-3 py-1 rounded-lg hover:bg-green-700">
                      Resolve
                    </button>
                  ) : (
                    <span className="text-xs text-green-600">${item.confirmed_price?.toFixed(4)}/gm</span>
                  )}
                </td>
              </tr>
            ))}
            {current.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No {tab} items</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
