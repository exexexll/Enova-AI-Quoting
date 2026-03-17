import { useState, useEffect } from 'react';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export default function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(isStreaming || false);

  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse thinking' : 'Expand thinking'}
      className={`w-full max-w-[90%] thinking-block ${expanded ? '' : 'collapsed'}`}
      onClick={() => !isStreaming && setExpanded(!expanded)}
      onKeyDown={(e) => { if (!isStreaming && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpanded(!expanded); } }}
    >
      <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span>Thinking</span>
        {isStreaming && <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />}
        {!isStreaming && (
          <span className="ml-auto text-xs">{expanded ? '▼' : '▶'}</span>
        )}
      </div>
      {expanded && (
        <div className="text-xs whitespace-pre-wrap text-gray-500 leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
}
