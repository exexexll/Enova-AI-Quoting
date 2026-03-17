import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '../config';

export type StreamEvent = {
  event: string;
  data: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  phase?: 'thinking' | 'executing' | 'tool_call' | 'tool_result';
  content: string;
  timestamp: string;
};

export type PriceBreakdown = {
  ingredient?: { low: number; mid: number; high: number };
  machine?: { low: number; mid: number; high: number };
  labor?: { low: number; mid: number; high: number };
  packaging?: { low: number; mid: number; high: number };
  transport?: { low: number; mid: number; high: number };
  total?: { low: number; mid: number; high: number };
  margin_pct?: number;
  warnings?: string[];
  blockers?: string[];
};

type PopupData = {
  action?: string;
  pre_search?: string;
  category_filter?: string;
};

function parseSSEEvents(raw: string): { events: StreamEvent[]; remaining: string } {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split('\n\n');
  const remaining = blocks.pop() || '';
  const events: StreamEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = 'message';
    const dataChunks: string[] = [];

    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('event:')) {
        eventType = trimmed.substring(6).trim();
      } else if (trimmed.startsWith('data:')) {
        dataChunks.push(trimmed.substring(5).trim());
      }
    }

    if (dataChunks.length > 0) {
      events.push({ event: eventType, data: dataChunks.join('\n') });
    }
  }

  return { events, remaining };
}

function tryParseJSON(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}

export function useSSEStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentThinking, setCurrentThinking] = useState('');
  const [currentExecuting, setCurrentExecuting] = useState('');
  const [priceUpdate, setPriceUpdate] = useState<PriceBreakdown | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupData, setPopupData] = useState<PopupData | null>(null);
  const [workflowState, setWorkflowState] = useState<string>('intake');
  const [visitedStates, setVisitedStates] = useState<string[]>(['intake']);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (sessionId: string, message: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      phase: 'executing',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamError(null);
    setCurrentThinking('');
    setCurrentExecuting('');

    const controller = new AbortController();
    abortRef.current = controller;

    let thinkBuf = '';
    let execBuf = '';

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEEvents(sseBuffer);
        sseBuffer = remaining;

        for (const sseEvent of events) {
          let content = '';
          const parsed = tryParseJSON(sseEvent.data);
          if (parsed && typeof parsed === 'object' && 'content' in (parsed as Record<string, unknown>)) {
            content = String((parsed as Record<string, unknown>).content ?? '');
          } else if (typeof parsed === 'string') {
            content = parsed;
          } else {
            content = sseEvent.data;
          }

          switch (sseEvent.event) {
            case 'thinking':
              thinkBuf += content;
              setCurrentThinking(thinkBuf);
              break;

            case 'executing':
              execBuf += content;
              setCurrentExecuting(execBuf);
              break;

            case 'price_update': {
              const priceData = extractPriceData(sseEvent.data, content);
              if (priceData) setPriceUpdate(priceData);
              break;
            }

            case 'popup': {
              setShowPopup(true);
              const pd = tryParseJSON(content) || tryParseJSON(sseEvent.data);
              if (pd && typeof pd === 'object') setPopupData(pd as PopupData);
              break;
            }

            case 'workflow_state': {
              const ws = tryParseJSON(content) || tryParseJSON(sseEvent.data);
              if (ws && typeof ws === 'object' && 'state' in (ws as Record<string, unknown>)) {
                const state = String((ws as Record<string, unknown>).state);
                setWorkflowState(state);
                setVisitedStates(prev => prev.includes(state) ? prev : [...prev, state]);
              }
              break;
            }

            case 'done':
              break;

            default:
              break;
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled -- not an error
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('SSE stream error:', msg);
        setStreamError(msg);
        execBuf += '\n\nSorry, an error occurred. Please try again.';
      }
    }

    const finalMessages: ChatMessage[] = [];
    if (thinkBuf) {
      finalMessages.push({
        id: Date.now().toString() + '_t',
        role: 'assistant',
        phase: 'thinking',
        content: thinkBuf,
        timestamp: new Date().toISOString(),
      });
    }
    if (execBuf) {
      finalMessages.push({
        id: Date.now().toString() + '_e',
        role: 'assistant',
        phase: 'executing',
        content: execBuf,
        timestamp: new Date().toISOString(),
      });
    }
    if (finalMessages.length > 0) {
      setMessages(prev => [...prev, ...finalMessages]);
    }

    setIsStreaming(false);
    setCurrentThinking('');
    setCurrentExecuting('');
  }, []);

  const loadHistory = useCallback(async (sessionId: string) => {
    setPriceUpdate(null);
    setShowPopup(false);
    setPopupData(null);
    setCurrentThinking('');
    setCurrentExecuting('');
    setStreamError(null);

    try {
      const resp = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: Array<{ id: number; role: string; phase?: string; content?: string; timestamp: string }> = await resp.json();

      setMessages(data.map(m => ({
        id: m.id.toString(),
        role: m.role as ChatMessage['role'],
        phase: m.phase as ChatMessage['phase'],
        content: m.content || '',
        timestamp: m.timestamp,
      })));

      const sessResp = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
      if (!sessResp.ok) throw new Error(`HTTP ${sessResp.status}`);
      const sessData = await sessResp.json();

      if (sessData.workflow_state) {
        setWorkflowState(sessData.workflow_state);
        const visited = new Set<string>(['intake']);
        for (const m of data) {
          if (m.phase === 'tool_result' && m.content) {
            const parsed = tryParseJSON(m.content);
            if (parsed && typeof parsed === 'object') {
              const obj = parsed as Record<string, unknown>;
              if (typeof obj.workflow_state === 'string') visited.add(obj.workflow_state);
              if (typeof obj.previous_state === 'string') visited.add(obj.previous_state);
            }
          }
        }
        visited.add(sessData.workflow_state);
        setVisitedStates(Array.from(visited));
      } else {
        setWorkflowState('intake');
        setVisitedStates(['intake']);
      }

      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].phase === 'tool_result' && data[i].content) {
          const parsed = tryParseJSON(data[i].content!);
          if (parsed && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            if (obj.total && obj.ingredient) {
              setPriceUpdate(obj as unknown as PriceBreakdown);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setWorkflowState('intake');
      setVisitedStates(['intake']);
    }
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
    setIsStreaming(false);
    setCurrentThinking('');
    setCurrentExecuting('');
    setPriceUpdate(null);
    setShowPopup(false);
    setPopupData(null);
    setWorkflowState('intake');
    setVisitedStates(['intake']);
    setStreamError(null);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return {
    messages,
    isStreaming,
    currentThinking,
    currentExecuting,
    priceUpdate,
    showPopup,
    popupData,
    setShowPopup,
    workflowState,
    visitedStates,
    streamError,
    sendMessage,
    loadHistory,
    resetChat,
  };
}

function extractPriceData(rawData: string, content: string): PriceBreakdown | null {
  // SSE price_update can be double-encoded
  const tryParse = (s: string): PriceBreakdown | null => {
    const p = tryParseJSON(s);
    if (p && typeof p === 'object' && 'total' in (p as Record<string, unknown>)) {
      return p as PriceBreakdown;
    }
    return null;
  };

  let result = tryParse(content);
  if (result) return result;

  result = tryParse(rawData);
  if (result) return result;

  const outer = tryParseJSON(rawData);
  if (outer && typeof outer === 'object' && 'content' in (outer as Record<string, unknown>)) {
    const inner = tryParse(String((outer as Record<string, unknown>).content));
    if (inner) return inner;
  }

  return null;
}
