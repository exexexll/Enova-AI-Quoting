import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';

type SampleOrder = {
  session_id: string;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  workflow_state: string;
  updated_at: string;
  ingredients: Array<{
    ingredient_name: string;
    mg_per_serving: number | null;
    confidence: string | null;
    cost_source: string | null;
  }>;
  quote: {
    total_low: number | null;
    total_mid: number | null;
    total_high: number | null;
    margin_pct: number | null;
    version: number;
  } | null;
};

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  sample_decision: { label: 'Awaiting Decision', color: 'bg-yellow-100 text-yellow-700' },
  sample_payment: { label: 'Payment Pending', color: 'bg-orange-100 text-orange-700' },
  sample_production: { label: 'In Production', color: 'bg-blue-100 text-blue-700' },
  sample_confirmation: { label: 'Awaiting Confirmation', color: 'bg-purple-100 text-purple-700' },
};

export default function SampleOrders() {
  const [orders, setOrders] = useState<SampleOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SampleOrder | null>(null);

  useEffect(() => {
    fetch(`${API}/api/admin/sample-orders`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setOrders(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(err => { console.error('Failed to load sample orders:', err); setLoading(false); });
  }, []);

  const downloadSample = (sessionId: string) => {
    window.open(`${API}/api/sessions/${sessionId}/export/sample`, '_blank');
  };

  const downloadRecord = (sessionId: string) => {
    window.open(`${API}/api/sessions/${sessionId}/export/record`, '_blank');
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Sample Orders</h2>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
          No sample orders yet. Orders appear here when clients reach the sample stage.
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map(order => {
            const stateInfo = STATE_LABELS[order.workflow_state] || { label: order.workflow_state, color: 'bg-gray-100 text-gray-600' };
            const isSelected = selected?.session_id === order.session_id;

            return (
              <div key={order.session_id}
                className={`bg-white rounded-lg shadow-sm overflow-hidden border ${isSelected ? 'border-blue-300' : 'border-transparent'}`}
              >
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setSelected(isSelected ? null : order)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-800">
                        {order.client_name || `Session ${order.session_id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {order.client_company && `${order.client_company} · `}
                        {order.client_email || 'No email'}
                        {' · '}
                        {new Date(order.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${stateInfo.color}`}>
                        {stateInfo.label}
                      </span>
                      {order.quote && (
                        <span className="text-sm font-semibold text-gray-700">
                          ${order.quote.total_low?.toFixed(2)} – ${order.quote.total_high?.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div className="border-t border-gray-100 p-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <div className="text-xs text-gray-500 uppercase mb-2">Ingredients ({order.ingredients.length})</div>
                        {order.ingredients.length > 0 ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-400 uppercase">
                                <th className="pb-1">Name</th>
                                <th className="pb-1">mg/serving</th>
                                <th className="pb-1">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.ingredients.map((ing, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="py-1 text-gray-700">{ing.ingredient_name}</td>
                                  <td className="py-1 text-gray-600">{ing.mg_per_serving || '—'}</td>
                                  <td className="py-1">
                                    <span className={`text-xs ${ing.confidence === 'HIGH' ? 'text-green-600' : ing.confidence === 'MEDIUM' ? 'text-yellow-600' : 'text-red-500'}`}>
                                      {ing.confidence || '—'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="text-sm text-gray-400">No ingredients recorded</div>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 uppercase mb-2">Quote</div>
                        {order.quote ? (
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Per unit</span>
                              <span className="font-medium">${order.quote.total_low?.toFixed(2)} – ${order.quote.total_high?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Margin</span>
                              <span>{((order.quote.margin_pct || 0) * 100).toFixed(0)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Version</span>
                              <span>v{order.quote.version}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">No quote generated</div>
                        )}

                        <div className="mt-4 flex gap-2">
                          <button
                            onClick={() => downloadSample(order.session_id)}
                            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700"
                          >
                            Download Sample Request
                          </button>
                          <button
                            onClick={() => downloadRecord(order.session_id)}
                            className="bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-300"
                          >
                            Export Full Record
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
