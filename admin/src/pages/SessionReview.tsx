import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';
import type { Session, ChatMessage, ClientFile } from '../types';

type SessionDetail = Session & {
  client_phone?: string;
  client_address?: string;
  context_json?: string;
};

type SessionIngredient = {
  ingredient_name: string;
  mg_per_serving: number | null;
  confidence: string | null;
  cost_source: string | null;
  unit_cost: number | null;
};

type Quote = {
  total_low: number | null;
  total_mid: number | null;
  total_high: number | null;
  ingredient_cost_low: number | null;
  ingredient_cost_mid: number | null;
  ingredient_cost_high: number | null;
  machine_cost_low: number | null;
  machine_cost_mid: number | null;
  machine_cost_high: number | null;
  labor_cost_low: number | null;
  labor_cost_mid: number | null;
  labor_cost_high: number | null;
  packaging_cost_low: number | null;
  packaging_cost_mid: number | null;
  packaging_cost_high: number | null;
  transport_cost_low: number | null;
  transport_cost_mid: number | null;
  transport_cost_high: number | null;
  margin_pct: number | null;
  version: number;
};

type Escalation = {
  item_requested: string;
  source: string;
  status: string;
  confirmed_price: number | null;
};

const WORKFLOW_LABELS: Record<string, string> = {
  intake: 'Inquiry',
  evaluation: 'Evaluation',
  customer_registration: 'Registration',
  technical_review: 'Formulation',
  cost_calculation: 'Pricing',
  quotation: 'Quote Review',
  sample_decision: 'Sample Decision',
  sample_payment: 'Sample Payment',
  sample_production: 'Sample Production',
  sample_confirmation: 'Sample Confirmation',
  order_confirmation: 'Contract',
  production: 'Production',
  closed: 'Closed',
};

const STATE_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  abandoned: 'bg-red-100 text-red-700',
  paused: 'bg-yellow-100 text-yellow-700',
};

export default function SessionReview() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [ingredients, setIngredients] = useState<SessionIngredient[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [tab, setTab] = useState<'transcript' | 'info' | 'formula' | 'pricing'>('transcript');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch(`${API}/api/sessions?limit=200`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load sessions:', err));
  }, []);

  const selectSession = async (session: Session) => {
    try {
      const [sessResp, msgsResp, fsResp] = await Promise.all([
        fetch(`${API}/api/sessions/${session.id}`),
        fetch(`${API}/api/sessions/${session.id}/messages`),
        fetch(`${API}/api/sessions/${session.id}/files`),
      ]);
      const sessData = sessResp.ok ? await sessResp.json() : session;
      const msgs = msgsResp.ok ? await msgsResp.json() : [];
      const fs = fsResp.ok ? await fsResp.json() : [];
      setSelected(sessData);
      setMessages(Array.isArray(msgs) ? msgs : []);
      setFiles(Array.isArray(fs) ? fs : []);

      fetch(`${API}/api/admin/sample-orders`)
        .then(r => r.ok ? r.json() : [])
        .then(orders => {
          const order = (orders as Array<{ session_id: string; ingredients: SessionIngredient[]; quote: Quote | null }>)
            .find((o) => o.session_id === session.id);
          if (order) {
            setIngredients(order.ingredients || []);
            setQuote(order.quote);
          } else {
            setIngredients([]);
            setQuote(null);
          }
        })
        .catch(() => { setIngredients([]); setQuote(null); });

      fetch(`${API}/api/escalations?status=all`)
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          const sessEsc = (data as Escalation[]).filter((e: Escalation & { session_id?: string }) =>
            (e as unknown as { session_id: string }).session_id === session.id
          );
          setEscalations(sessEsc);
        })
        .catch(() => setEscalations([]));
    } catch (err) {
      console.error('Failed to load session details:', err);
    }
  };

  const filteredSessions = filter === 'all'
    ? sessions
    : sessions.filter(s => s.status === filter || s.workflow_state === filter);

  const visibleMessages = messages.filter(m => m.phase !== 'tool_result' || tab === 'transcript');

  return (
    <div className="flex gap-0 h-screen">
      {/* Session list */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-100">
          <div className="font-medium text-sm text-gray-700 mb-2">Sessions ({sessions.length})</div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Closed</option>
            <option value="sample_payment">Sample Stage</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.map((s) => (
            <div key={s.id} onClick={() => selectSession(s)}
              className={`p-3 border-b border-gray-50 cursor-pointer text-sm transition-colors ${selected?.id === s.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'}`}>
              <div className="font-medium text-gray-800 truncate">{s.client_name || `Session ${s.id.slice(0, 8)}`}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATE_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>
                  {s.status}
                </span>
                <span className="text-[10px] text-gray-400">{WORKFLOW_LABELS[s.workflow_state] || s.workflow_state}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{new Date(s.updated_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {selected ? (
          <>
            {/* Header with checklist */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 text-lg">{selected.client_name || selected.id}</h3>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {selected.client_email || 'No email'} · {selected.client_company || 'No company'} · {selected.client_phone || 'No phone'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.open(`${API}/api/sessions/${selected.id}/export/sample`, '_blank')}
                    className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700"
                  >
                    📥 Sample Request
                  </button>
                  <button
                    onClick={() => window.open(`${API}/api/sessions/${selected.id}/export/record`, '_blank')}
                    className="bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-300"
                  >
                    📋 Full Record
                  </button>
                </div>
              </div>

              {/* Data checklist */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                <CheckItem label="Name" ok={!!selected.client_name} />
                <CheckItem label="Email" ok={!!selected.client_email} />
                <CheckItem label="Company" ok={!!selected.client_company} />
                <CheckItem label="Phone" ok={!!selected.client_phone} />
                <CheckItem label="Address" ok={!!selected.client_address} />
                <CheckItem label="Ingredients" ok={ingredients.length > 0} />
                <CheckItem label="Pricing" ok={!!quote} />
                <CheckItem label="Contract" ok={!!selected.contract_status} />
                <CheckItem label="Files" ok={files.length > 0} />
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-3">
                {(['transcript', 'info', 'formula', 'pricing'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${tab === t ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {t === 'transcript' ? '💬 Chat' : t === 'info' ? '👤 Client' : t === 'formula' ? '🧪 Formula' : '💰 Pricing'}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {tab === 'transcript' && (
                <div className="space-y-3 max-w-3xl">
                  {files.length > 0 && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200 mb-4">
                      <div className="text-xs text-gray-500 uppercase mb-2">Uploaded Files</div>
                      <div className="flex flex-wrap gap-2">
                        {files.map((f) => (
                          <span key={f.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg">
                            {f.content_type?.startsWith('image') ? '🖼️' : f.filename?.endsWith('.pdf') ? '📄' : '📎'}
                            {f.filename}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {visibleMessages.map((m) => {
                    if (m.phase === 'thinking') return (
                      <div key={m.id} className="bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-400 italic border-l-2 border-gray-300">
                        <span className="text-[10px] text-gray-300 block mb-0.5">🧠 Thinking</span>
                        {(m.content || '').slice(0, 200)}{(m.content || '').length > 200 ? '...' : ''}
                      </div>
                    );
                    if (m.phase === 'tool_call' || m.phase === 'tool_result') {
                      let toolName = '';
                      try {
                        const meta = JSON.parse(m.metadata_json || '{}');
                        toolName = meta.tool || '';
                      } catch { /* empty */ }
                      return (
                        <div key={m.id} className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700 border-l-2 border-amber-300">
                          <span className="text-[10px] text-amber-400 block mb-0.5">
                            {m.phase === 'tool_call' ? '⚙️ Tool Call' : '📦 Tool Result'}{toolName ? `: ${toolName}` : ''}
                          </span>
                          {(m.content || '').slice(0, 300)}{(m.content || '').length > 300 ? '...' : ''}
                        </div>
                      );
                    }
                    if (m.role === 'user') return (
                      <div key={m.id} className="flex justify-end">
                        <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[70%] text-sm shadow-sm">
                          {m.content}
                        </div>
                      </div>
                    );
                    return (
                      <div key={m.id} className="flex justify-start">
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] text-sm text-gray-700 shadow-sm whitespace-pre-wrap">
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'info' && (
                <div className="bg-white rounded-lg border border-gray-200 max-w-lg">
                  <InfoRow label="Session ID" value={selected.id} />
                  <InfoRow label="Status" value={selected.status} />
                  <InfoRow label="Workflow" value={WORKFLOW_LABELS[selected.workflow_state] || selected.workflow_state} />
                  <InfoRow label="Contract" value={selected.contract_status || '—'} />
                  <InfoRow label="Name" value={selected.client_name} missing={!selected.client_name} />
                  <InfoRow label="Email" value={selected.client_email} missing={!selected.client_email} />
                  <InfoRow label="Company" value={selected.client_company} missing={!selected.client_company} />
                  <InfoRow label="Phone" value={selected.client_phone} missing={!selected.client_phone} />
                  <InfoRow label="Address" value={selected.client_address} missing={!selected.client_address} />
                  <InfoRow label="Created" value={new Date(selected.created_at).toLocaleString()} />
                  <InfoRow label="Updated" value={new Date(selected.updated_at).toLocaleString()} />
                  {escalations.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 uppercase font-medium">Escalated Items</div>
                      {escalations.map((e, i) => (
                        <InfoRow key={i} label={e.item_requested} value={`${e.status} ${e.confirmed_price ? `— $${e.confirmed_price}` : ''}`} />
                      ))}
                    </>
                  )}
                </div>
              )}

              {tab === 'formula' && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-2xl">
                  {ingredients.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                          <th className="px-4 py-2">Ingredient</th>
                          <th className="px-4 py-2">mg/serving</th>
                          <th className="px-4 py-2">Cost/serving</th>
                          <th className="px-4 py-2">Confidence</th>
                          <th className="px-4 py-2">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ingredients.map((ing, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-4 py-2 font-medium text-gray-800">{ing.ingredient_name}</td>
                            <td className="px-4 py-2 text-gray-600">{ing.mg_per_serving ?? '—'}</td>
                            <td className="px-4 py-2 text-gray-600">{ing.unit_cost != null ? `$${ing.unit_cost.toFixed(4)}` : '—'}</td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${ing.confidence === 'HIGH' ? 'bg-green-100 text-green-700' : ing.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                {ing.confidence || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-400">{ing.cost_source || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-sm">No ingredients selected yet</div>
                  )}
                </div>
              )}

              {tab === 'pricing' && (
                <div className="max-w-lg">
                  {quote ? (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <div className="text-2xl font-bold text-gray-800">
                          ${quote.total_low?.toFixed(2)} – ${quote.total_high?.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">per unit · {((quote.margin_pct || 0) * 100).toFixed(0)}% margin · v{quote.version}</div>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 uppercase">
                            <th className="px-4 py-2">Component</th>
                            <th className="px-4 py-2">Low</th>
                            <th className="px-4 py-2">Mid</th>
                            <th className="px-4 py-2">High</th>
                          </tr>
                        </thead>
                        <tbody>
                          <PriceRow label="Ingredients" low={quote.ingredient_cost_low} mid={quote.ingredient_cost_mid} high={quote.ingredient_cost_high} />
                          <PriceRow label="Machine" low={quote.machine_cost_low} mid={quote.machine_cost_mid} high={quote.machine_cost_high} />
                          <PriceRow label="Labor" low={quote.labor_cost_low} mid={quote.labor_cost_mid} high={quote.labor_cost_high} />
                          <PriceRow label="Packaging" low={quote.packaging_cost_low} mid={quote.packaging_cost_mid} high={quote.packaging_cost_high} />
                          <PriceRow label="Shipping" low={quote.transport_cost_low} mid={quote.transport_cost_mid} high={quote.transport_cost_high} />
                          <tr className="border-t-2 border-gray-200 font-semibold">
                            <td className="px-4 py-2">Total</td>
                            <td className="px-4 py-2">${quote.total_low?.toFixed(4)}</td>
                            <td className="px-4 py-2">${quote.total_mid?.toFixed(4)}</td>
                            <td className="px-4 py-2">${quote.total_high?.toFixed(4)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
                      No pricing calculated yet
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Select a session to review</div>
        )}
      </div>
    </div>
  );
}


function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
      {ok ? '✅' : '⬜'} {label}
    </span>
  );
}

function InfoRow({ label, value, missing }: { label: string; value?: string | null; missing?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-b-0">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <span className={`text-sm ${missing ? 'text-red-400 italic' : 'text-gray-800'}`}>
        {value || (missing ? 'Missing' : '—')}
      </span>
    </div>
  );
}

function PriceRow({ label, low, mid, high }: { label: string; low: number | null; mid: number | null; high: number | null }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-2 text-gray-600">{label}</td>
      <td className="px-4 py-2 text-gray-600">${(low || 0).toFixed(4)}</td>
      <td className="px-4 py-2 text-gray-600">${(mid || 0).toFixed(4)}</td>
      <td className="px-4 py-2 text-gray-600">${(high || 0).toFixed(4)}</td>
    </tr>
  );
}
