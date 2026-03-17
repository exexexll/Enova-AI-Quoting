interface PricingIndicatorProps {
  priceData: {
    ingredient?: { low: number; mid: number; high: number };
    machine?: { low: number; mid: number; high: number };
    labor?: { low: number; mid: number; high: number };
    packaging?: { low: number; mid: number; high: number };
    transport?: { low: number; mid: number; high: number };
    total?: { low: number; mid: number; high: number };
    margin_pct?: number;
    warnings?: string[];
    blockers?: string[];
  } | null;
}

function Row({ label, low, high }: { label: string; low: number; high: number }) {
  if (low === 0 && high === 0) return null;
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700 font-medium">${low.toFixed(3)} – ${high.toFixed(3)}</span>
    </div>
  );
}

export default function PricingIndicator({ priceData }: PricingIndicatorProps) {
  if (!priceData?.total || (priceData.total.low === 0 && priceData.total.high === 0)) {
    return null;
  }

  const { total, ingredient, machine, labor, packaging, transport, warnings, blockers } = priceData;
  const hasWarnings = warnings && warnings.length > 0;
  const hasBlockers = blockers && blockers.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Price Estimate</div>

      {/* Total */}
      <div className="text-xl font-bold text-gray-900 mb-0.5">
        ${total!.low.toFixed(2)} – ${total!.high.toFixed(2)}
      </div>
      <div className="text-[10px] text-gray-400 mb-3">per unit</div>

      {/* Breakdown */}
      <div className="border-t border-gray-100 pt-2 space-y-0">
        {ingredient && <Row label="Ingredients" low={ingredient.low} high={ingredient.high} />}
        {machine && <Row label="Machine" low={machine.low} high={machine.high} />}
        {labor && <Row label="Labor" low={labor.low} high={labor.high} />}
        {packaging && <Row label="Packaging" low={packaging.low} high={packaging.high} />}
        {transport && <Row label="Shipping" low={transport.low} high={transport.high} />}
      </div>

      {priceData.margin_pct !== undefined && priceData.margin_pct > 0 && (
        <div className="text-[10px] text-gray-400 mt-2">
          Includes {(priceData.margin_pct * 100).toFixed(0)}% margin
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          {warnings!.map((w, i) => (
            <div key={i} className="text-[10px] text-amber-500 leading-relaxed">{w}</div>
          ))}
        </div>
      )}

      {hasBlockers && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          {blockers!.map((b, i) => (
            <div key={i} className="text-[10px] text-red-500 leading-relaxed">{b}</div>
          ))}
        </div>
      )}
    </div>
  );
}
