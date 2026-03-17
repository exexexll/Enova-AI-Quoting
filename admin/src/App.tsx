import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import IngredientDB from './pages/IngredientDB';
import RequestQueue from './pages/RequestQueue';
import SessionReview from './pages/SessionReview';
import PricingConfig from './pages/PricingConfig';
import DBImport from './pages/DBImport';
import ContractManager from './pages/ContractManager';
import { API_BASE } from './config';

type Page = 'dashboard' | 'ingredients' | 'queue' | 'sessions' | 'config' | 'import' | 'contracts';

const NAV_ITEMS: { key: Page; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'ingredients', label: 'Ingredients', icon: '🧪' },
  { key: 'queue', label: 'Request Queue', icon: '📋' },
  { key: 'sessions', label: 'Sessions', icon: '💬' },
  { key: 'contracts', label: 'Contracts', icon: '📄' },
  { key: 'import', label: 'DB Import', icon: '📥' },
  { key: 'config', label: 'Pricing Config', icon: '⚙️' },
];

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-sm font-bold">Enova Admin</h1>
          <p className="text-xs text-gray-400 mt-0.5">Quoting System</p>
        </div>
        <div className="flex-1 py-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                page === item.key ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={async () => {
              try {
                const resp = await fetch(`${API_BASE}/api/admin/refresh-indices`, { method: 'POST' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                alert('Indices refreshed!');
              } catch (err) {
                alert('Failed to refresh indices. Check the backend connection.');
                console.error('Refresh indices error:', err);
              }
            }}
            className="w-full text-xs text-gray-400 hover:text-white py-1"
          >
            🔄 Refresh Indices
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {page === 'dashboard' && <Dashboard />}
        {page === 'ingredients' && <IngredientDB />}
        {page === 'queue' && <RequestQueue />}
        {page === 'sessions' && <SessionReview />}
        {page === 'config' && <PricingConfig />}
        {page === 'import' && <DBImport />}
        {page === 'contracts' && <ContractManager />}
      </main>
    </div>
  );
}
