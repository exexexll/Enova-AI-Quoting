import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';
import type { Ingredient } from '../types';

function EstimatedPrice({ name }: { name: string }) {
  const [range, setRange] = useState<{ low: number; high: number; source: string; notes?: string; items: string[] } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    fetch(`${API}/api/ingredients/estimate?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.est_low && data.est_high) {
          setRange({ low: data.est_low, high: data.est_high, source: data.source || 'est', notes: data.notes, items: data.similar_items || [] });
        }
      })
      .catch(() => {});
  }, [name, loaded]);

  if (!range) return <span className="text-gray-400 text-[11px] italic">Pending</span>;

  const tooltip = range.source === 'web'
    ? `Web: ${range.notes || 'bulk pricing'}`
    : `Similar: ${range.items.slice(0, 3).join(', ')}`;

  return (
    <span className="text-amber-600" title={tooltip}>
      ~${(range.low * 1000).toFixed(2)}–${(range.high * 1000).toFixed(2)}/kg
      {range.source === 'web' && <span className="ml-1 text-[9px]">🌐</span>}
    </span>
  );
}

export default function IngredientDB() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [hasPrice, setHasPrice] = useState<string>('');
  const [sources, setSources] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API}/api/ingredients/sources`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setSources(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [page, source, hasPrice]);

  const load = async () => {
    try {
      let url = `${API}/api/ingredients?page=${page}&per_page=30`;
      if (source) url += `&source=${source}`;
      if (hasPrice === 'yes') url += `&has_price=true`;
      if (hasPrice === 'no') url += `&has_price=false`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load ingredients:', err);
    }
  };

  const doSearch = async () => {
    if (!search.trim()) { load(); return; }
    try {
      const resp = await fetch(`${API}/api/ingredients/search?q=${encodeURIComponent(search)}&top_k=30`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setItems(Array.isArray(data) ? data.map((r: any) => r.ingredient) : []);
      setTotal(Array.isArray(data) ? data.length : 0);
      setPage(1);
    } catch (err) {
      console.error('Failed to search ingredients:', err);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Ingredient Database</h2>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Search ingredients..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-md"
        />
        <button onClick={doSearch} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg">Search</button>
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }}
          aria-label="Filter by source"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Sources</option>
          {sources.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={hasPrice} onChange={e => { setHasPrice(e.target.value); setPage(1); }}
          aria-label="Filter by price status"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="yes">Has Price</option>
          <option value="no">$0 Cost</option>
        </select>
      </div>

      <div className="text-sm text-gray-500 mb-2">{total.toLocaleString()} items</div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Name</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Source</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Supplier</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Avg Cost</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Cost/KG</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">On Hand</th>
              <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800 max-w-xs truncate">{item.item_name}</td>
                <td className="px-4 py-2 text-gray-500">{item.source_tab}</td>
                <td className="px-4 py-2 text-gray-500 max-w-[120px] truncate">{item.supplier || '-'}</td>
                <td className="px-4 py-2 text-right text-gray-700">{item.sum_cavg > 0 ? `$${item.sum_cavg.toFixed(4)}` : '-'}</td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {item.cost_kg > 0 ? `$${item.cost_kg.toFixed(2)}` : item.price_per_kg > 0 ? `$${item.price_per_kg.toFixed(2)}` : (
                    <EstimatedPrice name={item.item_name} />
                  )}
                </td>
                <td className="px-4 py-2 text-right text-gray-700">{item.on_hand > 0 ? item.on_hand.toLocaleString() : '-'}</td>
                <td className="px-4 py-2 text-center">
                  {item.needs_manual_price ? (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Estimated</span>
                  ) : (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Priced</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
          aria-label="Previous page"
          className="text-sm text-blue-600 disabled:text-gray-300">← Previous</button>
        <span className="text-sm text-gray-500">Page {page}</span>
        <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
          aria-label="Next page"
          className="text-sm text-blue-600 disabled:text-gray-300">Next →</button>
      </div>
    </div>
  );
}
