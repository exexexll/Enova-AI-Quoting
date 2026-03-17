import { useState, useEffect } from 'react';
import { API_BASE as API } from '../config';
import type { Session, ChatMessage, ClientFile } from '../types';

export default function SessionReview() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<ClientFile[]>([]);

  useEffect(() => {
    fetch(`${API}/api/sessions?limit=100`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load sessions:', err));
  }, []);

  const selectSession = async (session: any) => {
    setSelected(session);
    try {
      const [msgsResp, fsResp] = await Promise.all([
        fetch(`${API}/api/sessions/${session.id}/messages`),
        fetch(`${API}/api/sessions/${session.id}/files`),
      ]);
      const msgs = msgsResp.ok ? await msgsResp.json() : [];
      const fs = fsResp.ok ? await fsResp.json() : [];
      setMessages(Array.isArray(msgs) ? msgs : []);
      setFiles(Array.isArray(fs) ? fs : []);
    } catch (err) {
      console.error('Failed to load session details:', err);
    }
  };

  const exportRecord = async () => {
    if (!selected) return;
    window.open(`${API}/api/sessions/${selected.id}/export/record`, '_blank');
  };

  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-0px)]">
      {/* Session list */}
      <div className="w-72 bg-white rounded-lg shadow-sm overflow-y-auto">
        <div className="p-3 border-b border-gray-100 font-medium text-sm text-gray-700">
          Sessions ({sessions.length})
        </div>
        {sessions.map((s: any) => (
          <div key={s.id} onClick={() => selectSession(s)}
            className={`p-3 border-b border-gray-50 cursor-pointer text-sm ${selected?.id === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
            <div className="font-medium text-gray-800">{s.client_name || `Session ${s.id.slice(0, 6)}`}</div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'active' ? 'bg-green-400' : 'bg-gray-300'}`} />
              {s.workflow_state} · {new Date(s.updated_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div className="flex-1 bg-white rounded-lg shadow-sm overflow-y-auto">
        {selected ? (
          <div>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{selected.client_name || selected.id}</h3>
                <div className="text-xs text-gray-500 mt-0.5">{selected.client_email} · {selected.client_company}</div>
              </div>
              <button onClick={exportRecord} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg">
                Export Record
              </button>
            </div>

            {/* Files */}
            {files.length > 0 && (
              <div className="p-4 border-b border-gray-100">
                <div className="text-xs text-gray-500 uppercase mb-2">Uploaded Files</div>
                {files.map((f: any) => (
                  <div key={f.id} className="text-sm text-blue-600 hover:underline cursor-pointer">
                    📎 {f.filename}
                  </div>
                ))}
              </div>
            )}

            {/* Chat transcript */}
            <div className="p-4">
              <div className="text-xs text-gray-500 uppercase mb-3">Chat Transcript</div>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {messages.map((m: any) => (
                  <div key={m.id} className={`text-sm ${m.role === 'user' ? 'text-blue-700' : m.phase === 'thinking' ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                    <span className="text-xs text-gray-400 mr-2">{m.role}{m.phase === 'thinking' ? ' (thinking)' : ''}</span>
                    {m.content?.slice(0, 300)}{m.content?.length > 300 ? '...' : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Select a session to review</div>
        )}
      </div>
    </div>
  );
}
