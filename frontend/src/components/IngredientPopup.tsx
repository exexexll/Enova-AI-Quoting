import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config';

type Ingredient = {
  id: number;
  item_name: string;
  supplier?: string;
  uom?: string;
  sum_cavg: number;
  cost_kg: number;
  price_per_kg?: number;
  on_hand: number;
  source_tab: string;
  needs_manual_price: boolean;
};

type SearchResult = { ingredient?: Ingredient } & Partial<Ingredient>;

type IngredientPopupProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (ingredient: Ingredient, mgPerServing: number) => void;
  preSearch?: string;
  sessionId?: string;
};

const PREVIEW_NAMES = [
  'Vitamin C', 'Ashwagandha', 'CoQ10', 'Glutathione', 'Turmeric', 'Collagen',
  'Fish Oil', 'NMN', 'Magnesium', 'Zinc', 'Iron', 'Berberine', 'Vitamin D3', 'B12',
];

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function getCost(ing: Ingredient): { text: string; hasPrice: boolean; estimateText?: string } {
  if (ing.sum_cavg > 0) return { text: `$${ing.sum_cavg.toFixed(4)}/${ing.uom}`, hasPrice: true };
  if (ing.cost_kg > 0) return { text: `$${ing.cost_kg.toFixed(2)}/kg`, hasPrice: true };
  if (ing.price_per_kg != null && ing.price_per_kg > 0) return { text: `$${ing.price_per_kg.toFixed(2)}/kg`, hasPrice: true };
  return { text: 'Price not set', hasPrice: false };
}

function EstimatedRange({ ingredientName }: { ingredientName: string }) {
  const [range, setRange] = useState<{ low: number; high: number; items: string[] } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    fetch(`${API_BASE}/api/ingredients/estimate?name=${encodeURIComponent(ingredientName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.est_low && data.est_high) {
          setRange({ low: data.est_low, high: data.est_high, items: data.similar_items || [] });
        }
      })
      .catch(() => {});
  }, [ingredientName, loaded]);

  if (!range) return <span className="text-[11px] text-gray-400 italic whitespace-nowrap">No estimate</span>;

  return (
    <div className="text-right" title={`Est. from: ${range.items.slice(0, 3).join(', ')}`}>
      <div className="text-[11px] text-amber-600 font-medium whitespace-nowrap">
        ~${(range.low * 1000).toFixed(2)}–${(range.high * 1000).toFixed(2)}/kg
      </div>
      <div className="text-[9px] text-gray-400">estimated</div>
    </div>
  );
}

export default function IngredientPopup({ isOpen, onClose, onSelect, preSearch, sessionId }: IngredientPopupProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [previewItems, setPreviewItems] = useState<SearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const [expandedItem, setExpandedItem] = useState<SearchResult | null>(null);
  const [expandedImage, setExpandedImage] = useState('');
  const [mgPerServing, setMgPerServing] = useState(100);
  const [loading, setLoading] = useState(false);
  const [inquireSent, setInquireSent] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery(preSearch || '');
      setSelectedItem(null);
      setExpandedItem(null);
      setMgPerServing(100);
      setResults([]);
      setInquireSent(new Set());
      loadPreview();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, preSearch]);

  const loadPreview = async () => {
    const names = shuffle(PREVIEW_NAMES).slice(0, 6);
    const items: SearchResult[] = [];
    for (const name of names) {
      try {
        const r = await fetch(`${API_BASE}/api/ingredients/search?q=${encodeURIComponent(name)}&top_k=1`);
        const data = await r.json();
        if (data.length > 0) items.push(data[0]);
      } catch { /* skip */ }
    }
    setPreviewItems(items);
  };

  // Search on every keystroke (1+ chars)
  useEffect(() => {
    if (!isOpen) return;
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/api/ingredients/search?q=${encodeURIComponent(query.trim())}&top_k=20`);
        const data = await r.json();
        setResults(data);
      } catch { setResults([]); }
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Load image for expanded view
  useEffect(() => {
    if (!expandedItem) { setExpandedImage(''); return; }
    const name = expandedItem.ingredient?.item_name || expandedItem.item_name || '';
    fetch(`${API_BASE}/api/ingredient-image?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(d => setExpandedImage(d.url || ''))
      .catch(() => setExpandedImage(''));
  }, [expandedItem]);

  if (!isOpen) return null;

  const ing = (item: SearchResult): Ingredient => (item.ingredient || item) as Ingredient;
  const hasResults = query.trim().length > 0 && results.length > 0;
  const noResults = query.trim().length > 0 && !loading && results.length === 0;
  const showPreview = query.trim().length === 0;

  // Send price inquiry to admin escalation queue
  const inquirePrice = async (item: SearchResult) => {
    const i = ing(item);
    try {
      const resp = await fetch(`${API_BASE}/api/escalations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_requested: i.item_name || 'Unknown',
          source: 'missing',
          session_id: sessionId || '',
          quantity_needed: String(mgPerServing || 0) + 'mg',
          similar_items: JSON.stringify([]),
        }),
      });
      if (!resp.ok) console.error('Escalation POST failed:', resp.status);
    } catch (err) {
      console.error('Escalation request error:', err);
    }
    setInquireSent(prev => new Set(prev).add(i.id));
  };

  // ===== EXPANDED VIEW =====
  if (expandedItem) {
    const i = ing(expandedItem);
    const cost = getCost(i);
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <button onClick={() => setExpandedItem(null)} aria-label="Back to search results" className="text-[13px] text-blue-600 hover:text-blue-700">
              ← Back
            </button>
            <button onClick={onClose} aria-label="Close ingredient browser" className="text-gray-300 hover:text-gray-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {expandedImage && (
            <div className="w-full h-44 bg-gray-50 flex items-center justify-center">
              <img src={expandedImage} alt={i.item_name} className="max-h-full max-w-full object-contain" />
            </div>
          )}

          <div className="p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{i.item_name}</h3>
            <div className="flex flex-wrap gap-1.5 mb-4">
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{i.source_tab}</span>
              {i.supplier && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{i.supplier}</span>}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-[10px] text-gray-400">Cost</div>
                <div className={`text-sm font-semibold ${cost.hasPrice ? 'text-green-600' : 'text-amber-500'}`}>
                  {cost.text}
                </div>
                {!cost.hasPrice && <EstimatedRange ingredientName={i.item_name} />}
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-[10px] text-gray-400">Stock</div>
                <div className="text-sm font-semibold text-gray-700">
                  {i.on_hand > 0 ? `${i.on_hand.toLocaleString()} ${i.uom}` : '—'}
                </div>
              </div>
            </div>

            {!cost.hasPrice && (
              <button
                onClick={() => inquirePrice(expandedItem)}
                disabled={inquireSent.has(i.id)}
                className={`w-full text-[12px] py-2 rounded-lg mb-3 transition-colors ${
                  inquireSent.has(i.id)
                    ? 'bg-green-50 text-green-600 cursor-default'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer'
                }`}
              >
                {inquireSent.has(i.id) ? 'Price inquiry sent to team' : 'Inquire Actual Price →'}
              </button>
            )}

            <div className="flex items-end gap-3 pt-3 border-t border-gray-100">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 block mb-1">mg per serving</label>
                <input type="number" value={mgPerServing} onChange={e => setMgPerServing(Number(e.target.value))}
                  min={1} step={10}
                  className="w-full bg-gray-50 border-0 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <button onClick={() => { onSelect(i, mgPerServing); setExpandedItem(null); }}
                className="bg-blue-600 text-white rounded-lg px-5 py-2 text-[13px] font-medium hover:bg-blue-700 transition-colors">
                Add to Formula
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== MAIN LIST VIEW =====
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Browse Ingredients</h2>
          <button onClick={onClose} aria-label="Close ingredient browser" className="text-gray-300 hover:text-gray-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 flex-shrink-0">
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search 6,800+ ingredients..."
            className="w-full bg-gray-50 border-0 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white placeholder-gray-400" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="text-center py-8 text-gray-300 text-[13px]">Searching...</div>}

          {/* Preview grid */}
          {showPreview && !loading && previewItems.length > 0 && (
            <div className="p-4">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Popular Ingredients</div>
              <div className="grid grid-cols-2 gap-1.5">
                {previewItems.map((r) => {
                  const it = ing(r);
                  const c = getCost(it);
                  return (
                    <button key={it.id} onClick={() => setExpandedItem(r)}
                      className="bg-gray-50 hover:bg-blue-50 rounded-xl p-3 text-left transition-colors">
                      <div className="text-[13px] font-medium text-gray-800 truncate">{it.item_name}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {it.supplier || it.source_tab} · <span className={c.hasPrice ? 'text-green-600' : 'text-amber-500'}>{c.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search results */}
          {hasResults && !loading && (
            <div className="divide-y divide-gray-50">
              {results.map((r) => {
                const it = ing(r);
                const c = getCost(it);
                const selected = selectedItem && (ing(selectedItem).id === it.id);
                return (
                  <div key={it.id}
                    className={`px-4 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-2 ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedItem(r)}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-gray-800 truncate">{it.item_name}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {it.supplier && `${it.supplier} · `}{it.source_tab}
                        {it.on_hand > 0 && ` · ${it.on_hand.toLocaleString()} in stock`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {c.hasPrice ? (
                        <span className="text-[11px] font-medium text-green-600 whitespace-nowrap">{c.text}</span>
                      ) : (
                        <EstimatedRange ingredientName={it.item_name} />
                      )}
                      {!c.hasPrice && !inquireSent.has(it.id) && (
                        <button onClick={e => { e.stopPropagation(); inquirePrice(r); }}
                          className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded hover:bg-amber-100 whitespace-nowrap">
                          Inquire
                        </button>
                      )}
                      {inquireSent.has(it.id) && (
                        <span className="text-[10px] text-green-500">✓</span>
                      )}
                      <button onClick={e => { e.stopPropagation(); setExpandedItem(r); }}
                        className="text-[11px] text-blue-500 hover:text-blue-700 whitespace-nowrap">
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {noResults && <div className="text-center py-8 text-gray-300 text-[13px]">No results for "{query}"</div>}
        </div>

        {/* Bottom: quick add */}
        {selectedItem && (
          <div className="p-3 border-t border-gray-100 flex items-center gap-3 flex-shrink-0 bg-white">
            <div className="text-[13px] text-gray-700 font-medium truncate flex-1 min-w-0">
              {ing(selectedItem).item_name}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input type="number" value={mgPerServing} onChange={e => setMgPerServing(Number(e.target.value))}
                min={1} step={10} placeholder="mg"
                className="w-20 bg-gray-50 border-0 rounded-lg px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <button onClick={() => { onSelect(ing(selectedItem), mgPerServing); setSelectedItem(null); setMgPerServing(100); }}
                className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-[12px] font-medium hover:bg-blue-700 transition-colors">
                + Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
