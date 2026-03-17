import { useState, useEffect } from 'react';

import { API_BASE as API } from '../config';

interface ImportSection {
  title: string;
  endpoint: string;
  description: string;
  columns: string[];
}

const SECTIONS: ImportSection[] = [
  {
    title: 'Machine Wear Rates',
    endpoint: '/api/admin/import/machine-rates',
    description: 'Import machine hourly rates, setup costs, throughput, and maintenance.',
    columns: ['machine_type', 'model', 'hourly_rate', 'setup_cost', 'cleaning_cost', 'throughput_per_hour', 'maintenance_pct', 'notes'],
  },
  {
    title: 'Labor Rates',
    endpoint: '/api/admin/import/labor-rates',
    description: 'Import labor roles, hourly rates, headcount, and estimated hours.',
    columns: ['role', 'hourly_rate', 'headcount_per_line', 'est_hours_per_10k_units', 'overtime_multiplier', 'notes'],
  },
  {
    title: 'Packaging Rates',
    endpoint: '/api/admin/import/packaging-rates',
    description: 'Import packaging component costs (bottles, caps, labels, etc.).',
    columns: ['component_type', 'description', 'cost_per_unit', 'min_order_qty', 'lead_time_days', 'supplier', 'notes'],
  },
  {
    title: 'Transportation Rates',
    endpoint: '/api/admin/import/transport-rates',
    description: 'Import carrier rates for FedEx, UPS, air, sea, and land shipping.',
    columns: ['carrier', 'service_level', 'rate_type', 'rate_value', 'weight_min_lbs', 'weight_max_lbs', 'zone_or_region', 'surcharges_pct', 'notes'],
  },
];

export default function DBImport() {
  const [results, setResults] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  const handleUpload = async (section: ImportSection, file: File) => {
    setUploading(section.title);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const resp = await fetch(`${API}${section.endpoint}`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      const data = await resp.json();
      setResults(prev => ({ ...prev, [section.title]: data }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setResults(prev => ({ ...prev, [section.title]: { error: msg } }));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-2">Database Import</h2>
      <p className="text-sm text-gray-500 mb-6">Upload Excel files to populate pricing databases. The AI will reference these for calculations.</p>

      <div className="grid grid-cols-2 gap-4">
        {SECTIONS.map(section => (
          <div key={section.title} className="bg-white rounded-lg shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-1">{section.title}</h3>
            <p className="text-xs text-gray-500 mb-3">{section.description}</p>

            <div className="text-xs text-gray-400 mb-2">
              Expected columns: <code className="text-gray-600">{section.columns.join(', ')}</code>
            </div>

            <label className="block">
              <div className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                uploading === section.title ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
              }`}>
                {uploading === section.title ? (
                  <span className="text-sm text-blue-600">Uploading...</span>
                ) : (
                  <span className="text-sm text-gray-500">Click or drag Excel file here</span>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(section, file);
                  }}
                />
              </div>
            </label>

            {results[section.title] && (
              <div className="mt-2 text-xs">
                {results[section.title].rows_imported !== undefined ? (
                  <span className="text-green-600">
                    ✓ Imported {results[section.title].rows_imported} rows
                    {results[section.title].errors?.length > 0 && ` (${results[section.title].errors.length} errors)`}
                  </span>
                ) : (
                  <span className="text-red-500">Error: {results[section.title].error}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Current rates preview */}
      <div className="mt-8">
        <h3 className="font-semibold text-gray-800 mb-3">Currently Loaded Rates</h3>
        <RatesPreview />
      </div>
    </div>
  );
}

function RatesPreview() {
  const [rates, setRates] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const responses = await Promise.all([
        fetch(`${API}/api/admin/machine-rates`),
        fetch(`${API}/api/admin/labor-rates`),
        fetch(`${API}/api/admin/packaging-rates`),
        fetch(`${API}/api/admin/transport-rates`),
      ]);
      const [machine, labor, packaging, transport] = await Promise.all(
        responses.map(r => r.ok ? r.json() : [])
      );
      setRates({ machine, labor, packaging, transport });
    } catch (err) {
      console.error('Failed to load rates preview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-sm text-gray-400 py-4">Loading rates...</div>;

  return (
    <div className="grid grid-cols-2 gap-4">
      {Object.entries(rates).map(([key, items]) => (
        <div key={key} className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm font-medium text-gray-700 mb-2 capitalize">{key} ({items.length} rates)</div>
          {items.slice(0, 5).map((item: any, i: number) => (
            <div key={i} className="text-xs text-gray-500 truncate">
              {JSON.stringify(item).slice(0, 100)}...
            </div>
          ))}
          {items.length === 0 && <div className="text-xs text-gray-400">No rates imported yet</div>}
        </div>
      ))}
    </div>
  );
}
