import { useState, useCallback } from 'react';
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

export function useSession() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  const [sessionError, setSessionError] = useState<string | null>(null);

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
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      console.error('Failed to create session:', msg, '| API_BASE:', API_BASE);
      setSessionError(`Could not connect to server (${msg}). Check your connection.`);
      throw err;
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/sessions?limit=50`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setSessions(Array.isArray(data) ? data : []);
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
      return session;
    } catch (err) {
      console.error('Failed to select session:', err);
      return null;
    }
  }, []);

  const clearSession = useCallback(() => {
    setCurrentSession(null);
  }, []);

  return { currentSession, sessions, sessionError, createSession, loadSessions, selectSession, setCurrentSession, clearSession };
}
