/**
 * Floating suggestion chips that predict the user's next action
 * based on workflow state and conversation context.
 */

interface SuggestionChipsProps {
  workflowState: string;
  lastAssistantMessage: string;
  isStreaming: boolean;
  onSuggestionClick: (text: string) => void;
}

// Suggestions keyed by workflow state + context patterns
const STATE_SUGGESTIONS: Record<string, string[]> = {
  intake: [
    "I want to make capsules",
    "I need a powder supplement",
    "I'm looking for gummy vitamins",
    "I have an existing formula to replicate",
  ],
  evaluation: [
    "Yes, let's proceed",
    "What's your MOQ?",
    "I need 10,000 units",
    "I need 50,000 units",
  ],
  customer_registration: [
    "Here are my details",
    "Skip for now, I'll provide later",
    "I represent a company",
  ],
  technical_review: [
    "Show me available ingredients",
    "I want to add another ingredient",
    "That formula looks good, let's price it",
    "What dosage do you recommend?",
    "I have a label photo to upload",
  ],
  cost_calculation: [
    "That pricing looks good",
    "Can we reduce the cost?",
    "What if I order 25,000 units instead?",
    "Show me the breakdown",
  ],
  quotation: [
    "I accept this quote",
    "I'd like to adjust the formula",
    "Can you match a lower price?",
    "Let's proceed to sample",
  ],
  sample_decision: [
    "Yes, I'd like a sample first",
    "No, let's go straight to order",
    "How much does a sample cost?",
  ],
  sample_payment: [
    "I've made the payment",
    "What are the payment options?",
  ],
  sample_production: [
    "Any update on my sample?",
    "How long will it take?",
  ],
  sample_confirmation: [
    "The sample looks great, let's order",
    "I need some adjustments",
    "Can we change the dosage?",
  ],
  order_confirmation: [
    "Generate the contract",
    "I need to review the terms",
    "Everything looks good",
  ],
  production: [
    "When will my order ship?",
    "I'd like to start a new product",
  ],
};

// Dynamic suggestions based on what the AI last said
function getContextualSuggestions(lastMsg: string, state: string): string[] {
  const lower = lastMsg.toLowerCase();
  const suggestions: string[] = [];

  // If AI asked about product type
  if (lower.includes('what product') || lower.includes('product type') || lower.includes('product form')) {
    suggestions.push('Capsules', 'Tablets', 'Powder', 'Softgels', 'Gummies');
  }
  // If AI asked about quantity
  if (lower.includes('quantity') || lower.includes('how many units') || lower.includes('moq')) {
    suggestions.push('10,000 units', '25,000 units', '50,000 units', '100,000 units');
  }
  // If AI asked A/B/C
  if (lower.includes('reply with') && (lower.includes(' a,') || lower.includes(' a ') || lower.includes('a)'))) {
    suggestions.push('A', 'B', 'C');
  }
  // If AI asked yes/no
  if (lower.includes('would you like') || lower.includes('do you want') || lower.includes('shall we')) {
    suggestions.push('Yes', 'No');
  }
  // If AI is asking for contact info
  if (lower.includes('email') || lower.includes('phone') || lower.includes('company name')) {
    suggestions.push("I'll provide my details now", 'Skip for now');
  }
  // If AI confirmed ingredients
  if (lower.includes('formula') && (lower.includes('confirm') || lower.includes('look good') || lower.includes('finalize'))) {
    suggestions.push("Yes, that's correct", 'I want to add more', 'Change the dosage');
  }

  return suggestions;
}

export default function SuggestionChips({
  workflowState,
  lastAssistantMessage,
  isStreaming,
  onSuggestionClick,
}: SuggestionChipsProps) {
  if (isStreaming) return null;

  // Get contextual suggestions first, then state-based fallback
  let suggestions = getContextualSuggestions(lastAssistantMessage, workflowState);
  if (suggestions.length === 0) {
    suggestions = STATE_SUGGESTIONS[workflowState] || [];
  }

  // Limit to 4 suggestions
  suggestions = suggestions.slice(0, 4);

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-6 pb-2 pt-1">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
          className="text-[12px] px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 
                     hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50
                     transition-all duration-150 cursor-pointer"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
