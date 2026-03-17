import { useState, useEffect, useCallback } from 'react';
import { useSSEStream } from './hooks/useSSEStream';
import { useSession } from './hooks/useSession';
import Chat from './components/Chat';
import IngredientGrid from './components/IngredientGrid';
import SessionHistory from './components/SessionHistory';
import PricingIndicator from './components/PricingIndicator';
import IngredientPopup from './components/IngredientPopup';
import { API_BASE } from './config';

// ==================== Workflow Progress ====================

const WORKFLOW_STEPS = [
  { key: 'intake', label: 'Inquiry' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'customer_registration', label: 'Registration' },
  { key: 'technical_review', label: 'Formulation' },
  { key: 'cost_calculation', label: 'Pricing' },
  { key: 'quotation', label: 'Quote Review' },
  { key: 'sample_decision', label: 'Sample?' },
  { key: 'order_confirmation', label: 'Contract' },
  { key: 'production', label: 'Production' },
];

function WorkflowProgress({ currentState, visitedStates }: { currentState: string; visitedStates: string[] }) {
  const sampleStates = ['sample_payment', 'sample_production', 'sample_confirmation'];
  const isSampleFlow = sampleStates.includes(currentState);
  const visited = new Set(visitedStates);

  return (
    <div className="space-y-0.5">
      {WORKFLOW_STEPS.map((step) => {
        const isCurrent = step.key === currentState ||
          (isSampleFlow && step.key === 'sample_decision');
        const isVisited = visited.has(step.key) && !isCurrent;
        // A step is "skipped" if a later step was visited but this one was not
        const stepIdx = WORKFLOW_STEPS.findIndex(s => s.key === step.key);
        const currentIdx = WORKFLOW_STEPS.findIndex(s => s.key === currentState);
        const effectiveCurrentIdx = isSampleFlow
          ? WORKFLOW_STEPS.findIndex(s => s.key === 'sample_decision')
          : currentIdx;
        const isPast = stepIdx < effectiveCurrentIdx;
        const isSkipped = isPast && !visited.has(step.key);

        let dotColor = 'bg-gray-200';
        let textClass = 'text-gray-300';

        if (isCurrent) {
          dotColor = 'bg-blue-500';
          textClass = 'text-blue-700 font-semibold';
        } else if (isVisited) {
          dotColor = 'bg-green-400';
          textClass = 'text-green-600';
        } else if (isSkipped) {
          dotColor = 'bg-gray-200';
          textClass = 'text-gray-300';
        }

        return (
          <div key={step.key} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors ${
            isCurrent ? 'bg-blue-50' : ''
          }`}>
            {isVisited ? (
              <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
            )}
            <span className={`text-[12px] ${textClass}`}>
              {step.label}
              {isSkipped && <span className="text-[10px] text-gray-300 ml-1">(skipped)</span>}
              {isCurrent && isSampleFlow && (
                <span className="text-amber-500 font-normal ml-1 text-[11px]">
                  ({currentState === 'sample_payment' ? 'Payment' :
                    currentState === 'sample_production' ? 'R&D' : 'Confirm'})
                </span>
              )}
            </span>
          </div>
        );
      })}
      {currentState === 'closed' && (
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-red-50">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
          <span className="text-[12px] text-red-500 font-semibold">Closed</span>
        </div>
      )}
    </div>
  );
}

// Fisher-Yates shuffle (unbiased)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type SidebarItem = { id: number; item_name: string; sum_cavg: number };

const ITEM_HEIGHT = 28;

function SidebarIngredientPreview() {
  const [allItems, setAllItems] = useState<SidebarItem[]>([]);
  const [scrollIndex, setScrollIndex] = useState(0);
  useEffect(() => {
    // Fetch a page of real ingredients from the DB instead of hardcoded names
    fetch(`${API_BASE}/api/ingredients?page=1&per_page=20&has_price=true`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const items: SidebarItem[] = Array.isArray(data.items) ? shuffle(data.items) : [];
        setAllItems(items);
      })
      .catch(() => {});
  }, []);

  // Roll up by 1 item every 3 seconds
  useEffect(() => {
    if (allItems.length <= 2) return;
    const timer = setInterval(() => {
      setScrollIndex(prev => prev + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, [allItems.length]);

  if (allItems.length === 0) return null;

  const extended = [...allItems, ...allItems, ...allItems];
  const translateY = -(scrollIndex % allItems.length) * ITEM_HEIGHT;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* No header — ingredients roll seamlessly */}
      <div className="ingredient-roll-container" style={{ flex: 1, minHeight: 0 }}>
        <div className="ingredient-roll-track" style={{ transform: `translateY(${translateY}px)` }}>
          {extended.map((it, i) => (
            <div key={`${it.id}-${i}`}
              className="flex items-center justify-between text-[11px]"
              style={{ height: ITEM_HEIGHT }}>
              <span className="text-gray-600 truncate mr-2">{it.item_name}</span>
              <span className={`flex-shrink-0 text-[10px] ${it.sum_cavg > 0 ? 'text-green-500' : 'text-gray-300'}`}>
                {it.sum_cavg > 0 ? `$${it.sum_cavg.toFixed(4)}` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== Main App ====================

export default function App() {
  const {
    messages, isStreaming, currentThinking, currentExecuting,
    priceUpdate, showPopup, popupData, setShowPopup,
    workflowState, visitedStates, sendMessage, loadHistory, resetChat,
  } = useSSEStream();

  const {
    currentSession, sessions, sessionError, createSession, loadSessions, selectSession, clearSession,
  } = useSession();

  const [showHistory, setShowHistory] = useState(false);
  const [view, setView] = useState<'landing' | 'chat'>('landing');

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleStartChat = useCallback(async (firstMessage: string) => {
    resetChat();
    try {
      const session = await createSession();
      setView('chat');
      loadSessions();
      sendMessage(session.id, firstMessage);
    } catch {
      // sessionError state already set by useSession
    }
  }, [createSession, sendMessage, loadSessions, resetChat]);

  const handleSelectProductType = useCallback(async (productType: string) => {
    resetChat();
    try {
      const session = await createSession(productType);
      setView('chat');
      loadSessions();
      const label = productType.charAt(0).toUpperCase() + productType.slice(1);
      sendMessage(session.id, `I'd like to create a ${label} supplement product. Can you help me with formulation and pricing?`);
    } catch {
      // sessionError state already set by useSession
    }
  }, [createSession, sendMessage, loadSessions, resetChat]);

  const handleSendMessage = useCallback((message: string) => {
    if (currentSession) sendMessage(currentSession.id, message);
  }, [currentSession, sendMessage]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    await selectSession(sessionId);
    await loadHistory(sessionId); // Restores messages, workflow state, visited states, and pricing
    setView('chat');
  }, [selectSession, loadHistory]);

  const handleNewSession = useCallback(() => {
    resetChat();     // Clear messages, pricing, workflow state
    clearSession();  // Clear current session reference
    setView('landing');
    loadSessions();
  }, [resetChat, clearSession, loadSessions]);

  const handleLandingFileUpload = useCallback(async (file: File) => {
    resetChat();
    try {
      const session = await createSession();
      setView('chat');
      loadSessions();
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`${API_BASE}/api/sessions/${session.id}/upload`, {
        method: 'POST', body: formData,
      });
      const isImage = file.type.startsWith('image/');
      const msg = isImage
        ? `I've uploaded an image: ${file.name}. Please analyze it for any supplement formulation, label, or ingredient information.`
        : `I've uploaded a file: ${file.name}. Please extract any relevant product specifications or ingredient data.`;
      sendMessage(session.id, msg);
    } catch {
      // sessionError will show
    }
  }, [createSession, sendMessage, loadSessions, resetChat]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!currentSession) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const resp = await fetch(`${API_BASE}/api/sessions/${currentSession.id}/upload`, {
        method: 'POST', body: formData,
      });
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
      const isImage = file.type.startsWith('image/');
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      const isPdf = file.name.endsWith('.pdf');
      const description = isImage
        ? `I've uploaded an image: ${file.name}. Please analyze it for any supplement formulation, label, or ingredient information.`
        : isExcel
          ? `I've uploaded an Excel file: ${file.name}. Please extract ingredient lists, pricing, or formulation data from it.`
          : isPdf
            ? `I've uploaded a PDF: ${file.name}. Please extract any relevant product specifications, formulas, or pricing information.`
            : `I've uploaded a file: ${file.name}. Please analyze it and extract any relevant product information.`;
      sendMessage(currentSession.id, description);
    } catch (err) {
      console.error('Upload failed:', err);
      sendMessage(currentSession.id, `I tried to upload ${file.name} but the upload failed. Can we continue without it?`);
    }
  }, [currentSession, sendMessage]);

  const handleReviewContract = useCallback(async () => {
    if (!currentSession) return;
    window.open(`${API_BASE}/api/sessions/${currentSession.id}/contract/download`, '_blank');
  }, [currentSession]);

  const handleIngredientSelect = useCallback((ingredient: { item_name: string }, mg: number) => {
    setShowPopup(false);
    if (currentSession) {
      sendMessage(currentSession.id, `I'd like to add ${ingredient.item_name} at ${mg}mg per serving.`);
    }
  }, [currentSession, sendMessage, setShowPopup]);

  return (
    <div className="h-screen flex bg-white">
      {/* Session History */}
      <SessionHistory
        sessions={sessions}
        currentSessionId={currentSession?.id}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isOpen={showHistory}
        onToggle={() => setShowHistory(!showHistory)}
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-5 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHistory(!showHistory)} aria-label="Toggle session history" className="text-gray-300 hover:text-gray-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-[13px] font-semibold text-gray-800">Enova Science</span>
            {currentSession && (
              <span className="text-[12px] text-gray-400">
                · {currentSession.client_name || currentSession.id.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {currentSession?.contract_status && (
              <button onClick={handleReviewContract} aria-label="Review and download contract"
                className="bg-emerald-600 text-white text-[12px] px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700 transition-colors">
                Review Contract
              </button>
            )}
            {view === 'chat' && (
              <button onClick={handleNewSession} aria-label="Return to home screen" className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors">
                Home
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {view === 'landing' ? (
            <div className="flex-1 flex items-center justify-center overflow-y-auto">
              <div className="w-full">
                {sessionError && (
                  <div className="max-w-lg mx-auto px-6 mb-4">
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                      {sessionError}
                    </div>
                  </div>
                )}
                <IngredientGrid onSelectIngredient={handleSelectProductType} onStartChat={handleStartChat} onFileUpload={handleLandingFileUpload} />
              </div>
            </div>
          ) : (
            <>
              {/* Chat */}
              <div className="flex-1 min-w-0">
                <Chat
                  messages={messages}
                  isStreaming={isStreaming}
                  currentThinking={currentThinking}
                  currentExecuting={currentExecuting}
                  workflowState={workflowState || currentSession?.workflow_state || 'intake'}
                  onSendMessage={handleSendMessage}
                  onFileUpload={handleFileUpload}
                />
              </div>

              {/* Right panel */}
              <div className="w-64 bg-gray-50/50 border-l border-gray-100 hidden lg:flex lg:flex-col flex-shrink-0 overflow-hidden">
                <div className="p-4">
                  <div className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-3">Progress</div>
                  <WorkflowProgress
                    currentState={workflowState || currentSession?.workflow_state || 'intake'}
                    visitedStates={visitedStates}
                  />
                </div>

                {priceUpdate && (
                  <div className="px-4 pb-4">
                    <PricingIndicator priceData={priceUpdate} />
                  </div>
                )}

                <div className="px-4 pb-3">
                  <button onClick={() => setShowPopup(true)} aria-label="Open ingredient browser"
                    className="text-[12px] text-blue-600 hover:text-blue-700 transition-colors">
                    + Browse Ingredients
                  </button>
                </div>

                <div className="px-4 pb-2" style={{ flex: 1, minHeight: 0 }}>
                  <SidebarIngredientPreview />
                </div>
              </div>
            </>
          )}
        </div>
        </div>

      {/* Ingredient Popup */}
      <IngredientPopup
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
        onSelect={handleIngredientSelect}
        preSearch={popupData?.pre_search}
        sessionId={currentSession?.id}
      />
    </div>
  );
}
