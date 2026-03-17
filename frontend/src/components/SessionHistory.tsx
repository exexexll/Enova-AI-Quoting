import type { Session } from '../hooks/useSession';

interface SessionHistoryProps {
  sessions: Session[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function SessionHistory({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  isOpen,
  onToggle,
}: SessionHistoryProps) {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label="Open session history"
        className="fixed left-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-r-lg px-1 py-3 shadow-sm hover:bg-gray-50 z-30"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Sessions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewSession}
            aria-label="Create new session"
            className="text-blue-600 hover:text-blue-700 text-xs font-medium"
          >
            + New
          </button>
          <button onClick={onToggle} aria-label="Close session history" className="text-gray-400 hover:text-gray-600 ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            aria-label={`Open session: ${s.client_name || s.id.slice(0, 6)}`}
            onClick={() => onSelectSession(s.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSession(s.id); } }}
            className={`p-3 cursor-pointer border-b border-gray-50 transition-colors ${
              s.id === currentSessionId ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <div className="text-sm font-medium text-gray-800 truncate">
              {s.client_name || `Session ${s.id.slice(0, 6)}`}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                s.status === 'active' ? 'bg-green-400' : s.status === 'completed' ? 'bg-blue-400' : 'bg-gray-300'
              }`} />
              <span className="text-xs text-gray-500">{s.workflow_state}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {new Date(s.updated_at).toLocaleDateString()}
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">No sessions yet</div>
        )}
      </div>
    </div>
  );
}
