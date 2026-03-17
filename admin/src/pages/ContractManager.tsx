import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';
import type { Contract } from '../types';

export default function ContractManager() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    try {
      let url = `${API}/api/contracts`;
      if (filter) url += `?status=${filter}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setContracts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load contracts:', err);
    }
  };

  const accept = async (id: number) => {
    try {
      const resp = await fetch(`${API}/api/contracts/${id}/accept`, { method: 'PUT' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      console.error('Failed to accept contract:', err);
      alert('Failed to accept contract.');
    }
    load();
  };

  const requestRevision = async (id: number) => {
    const notes = prompt('Revision notes:') || '';
    try {
      const resp = await fetch(`${API}/api/contracts/${id}/revision?notes=${encodeURIComponent(notes)}`, { method: 'PUT' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      console.error('Failed to request revision:', err);
      alert('Failed to request revision.');
    }
    load();
  };

  const download = (path: string) => {
    const contract = contracts.find(c => c.pdf_path === path);
    if (!contract?.session_id) {
      alert('Cannot download: session not found for this contract.');
      return;
    }
    window.open(`${API}/api/sessions/${contract.session_id}/contract/download`, '_blank');
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    under_review: 'bg-blue-100 text-blue-600',
    submitted: 'bg-amber-100 text-amber-700',
    accepted: 'bg-green-100 text-green-700',
    revision: 'bg-red-100 text-red-600',
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Contract Manager</h2>

      <div className="flex gap-2 mb-4">
        {['', 'draft', 'submitted', 'accepted', 'revision'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg ${filter === s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Session</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Version</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Client Sig</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500">Submitted</th>
              <th className="text-center px-4 py-2 text-xs text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c: any) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{c.session_id}</td>
                <td className="px-4 py-3">v{c.version}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[c.status] || ''}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3">{c.client_name_sig || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{c.submitted_at || '-'}</td>
                <td className="px-4 py-3 text-center flex gap-2 justify-center">
                  {c.pdf_path && (
                    <button onClick={() => download(c.pdf_path)}
                      className="text-xs text-blue-600 hover:underline">Download</button>
                  )}
                  {c.status === 'submitted' && (
                    <>
                      <button onClick={() => accept(c.id)}
                        className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Accept</button>
                      <button onClick={() => requestRevision(c.id)}
                        className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">Revise</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No contracts found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
