import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';
import type { PricingConfig as PricingConfigType } from '../types';

export default function PricingConfig() {
  const [configs, setConfigs] = useState<PricingConfigType[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const resp = await fetch(`${API}/api/config`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setConfigs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load pricing config:', err);
    }
  };

  const save = async (key: string) => {
    try {
      const resp = await fetch(`${API}/api/config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editValue }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      console.error('Failed to save config:', err);
      alert('Failed to save. Check the backend connection.');
    }
    setEditing(null);
    load();
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Pricing Configuration</h2>
      <p className="text-sm text-gray-500 mb-6">Configure margins, waste factors, and other pricing parameters.</p>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden max-w-2xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Parameter</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Value</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Description</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c: any) => (
              <tr key={c.key} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800 font-mono text-xs">{c.key}</td>
                <td className="px-4 py-3">
                  {editing === c.key ? (
                    <input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && save(c.key)}
                      className="border border-blue-300 rounded px-2 py-1 text-sm w-24"
                      autoFocus
                    />
                  ) : (
                    <span className="text-gray-700">{c.value}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.description}</td>
                <td className="px-4 py-3">
                  {editing === c.key ? (
                    <div className="flex gap-1">
                      <button onClick={() => save(c.key)} className="text-green-600 text-xs">Save</button>
                      <button onClick={() => setEditing(null)} className="text-gray-400 text-xs">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditing(c.key); setEditValue(c.value); }}
                      className="text-blue-600 text-xs">Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
