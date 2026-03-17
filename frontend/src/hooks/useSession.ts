import { useState, useCallback, useEffect } from 'react';
import { API_BASE } from '../config';

export type Session = {
  id: string;
  client_name?: string;
  client_company?: string;
  status: string;
  workflow_state: string;
  contract_status?: string;
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = 'enova_session_ids';

function getStoredSessionIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addStoredSessionId(id: string) {
  const ids = getStoredSessionIds();
  if (!ids.includes(id)) {
    ids.unshift(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, 100)));
  }
}

export function useSession() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [mySessionIds, setMySessionIds] = useState<string[]>(() => getStoredSessionIds());

  useEffect(() => {
    setMySessionIds(getStoredSessionIds());
  }, []);

  const createSession = useCallback(async (preSelectedIngredient?: string): Promise<Session> => {
    setSessionError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_selected_ingredient: preSelectedIngredient }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      const session = await resp.json();
      setCurrentSession(session);
      addStoredSessionId(session.id);
      setMySessionIds(getStoredSessionIds());
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      console.error('Failed to create session:', msg, '| API_BASE:', API_BASE);
      setSessionError(`Could not connect to server (${msg}). Check your connection.`);
      throw err;
    }
  }, []);

  const loadSessions = useCallback(async () => {
    const ids = getStoredSessionIds();
    if (ids.length === 0) {
      setSessions([]);
      return;
    }
    try {
      const results: Session[] = [];
      const batchSize = 10;
      for (let i = 0; i < Math.min(ids.length, 50); i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const fetches = batch.map(id =>
          fetch(`${API_BASE}/api/sessions/${id}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        );
        const batchResults = await Promise.all(fetches);
        for (const s of batchResults) {
          if (s && s.id) results.push(s);
        }
      }
      setSessions(results);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    try {
      const resp = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const session = await resp.json();
      setCurrentSession(session);
      addStoredSessionId(session.id);
      setMySessionIds(getStoredSessionIds());
      return session;
    } catch (err) {
      console.error('Failed to select session:', err);
      return null;
    }
  }, []);

  const clearSession = useCallback(() => {
    setCurrentSession(null);
  }, []);

  return { currentSession, sessions, sessionError, mySessionIds, createSession, loadSessions, selectSession, setCurrentSession, clearSession };
}
