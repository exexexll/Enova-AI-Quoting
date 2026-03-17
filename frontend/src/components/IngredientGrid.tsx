import { useState } from 'react';

const PRODUCT_TYPES = [
  { key: 'capsule', label: 'Capsules',  image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=280&h=280&fit=crop&q=80' },
  { key: 'tablet',  label: 'Tablets',   image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=280&h=280&fit=crop&q=80' },
  { key: 'powder',  label: 'Powders',   image: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=280&h=280&fit=crop&q=80' },
  { key: 'gummy',   label: 'Gummies',   image: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=280&h=280&fit=crop&q=80' },
  { key: 'liquid',  label: 'Liquids',   image: 'https://images.unsplash.com/photo-1563191911-e65f8655ebf9?w=280&h=280&fit=crop&q=80' },
  { key: 'softgel', label: 'Softgels',  image: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=280&h=280&fit=crop&q=80' },
];

interface IngredientGridProps {
  onSelectIngredient: (name: string) => void;
  onStartChat: (message: string) => void;
}

function ProductCard({ product, onClick }: { product: typeof PRODUCT_TYPES[number]; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      onClick={onClick}
      aria-label={`Start a ${product.label.toLowerCase()} product`}
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm
                 hover:shadow-lg hover:-translate-y-0.5
                 transition-all duration-200 cursor-pointer z-10"
    >
      <div className="aspect-square w-full bg-gray-100 overflow-hidden">
        <img
          src={product.image}
          alt={product.label}
          className={`w-full h-full object-cover transition-opacity duration-300 group-hover:scale-105 transition-transform ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
            {product.label.charAt(0)}
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="text-[13px] font-semibold text-gray-800 text-center">{product.label}</div>
      </div>
    </button>
  );
}

export default function IngredientGrid({ onSelectIngredient, onStartChat }: IngredientGridProps) {
  const [input, setInput] = useState('');

  const cols = PRODUCT_TYPES.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-full bg-white">
      <div className="max-w-lg w-full mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Enova Science</h1>
          <p className="text-sm text-gray-400">AI-Powered Supplement Quoting</p>
        </div>

        <p className="text-center text-[13px] text-gray-500 mb-5">
          What type of supplement are you looking to create?
        </p>

        <div className={`grid ${cols} gap-3 mb-8`}>
          {PRODUCT_TYPES.map((product) => (
            <ProductCard
              key={product.key}
              product={product}
              onClick={() => onSelectIngredient(product.key)}
            />
          ))}
        </div>

        <div className="relative flex items-center gap-2 mb-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[11px] text-gray-300 uppercase tracking-wider">or describe your product</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              onStartChat(input.trim());
              setInput('');
            }
          }}
          className="relative mt-4"
        >
          <input
            name="message"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. I need a vitamin C capsule with zinc and biotin..."
            className="w-full bg-gray-50 border-0 rounded-xl px-5 py-3 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder-gray-400 shadow-sm"
          />
          <button
            type="submit"
            aria-label="Start a new conversation"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 text-white rounded-lg px-4 py-1.5 text-[12px] font-medium hover:bg-blue-700 transition-colors disabled:opacity-30"
            disabled={!input.trim()}
          >
            Start
          </button>
        </form>
      </div>
    </div>
  );
}
