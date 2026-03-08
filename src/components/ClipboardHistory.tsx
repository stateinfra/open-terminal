import React, { useState, useEffect, useCallback } from 'react';
import { VscCopy, VscTrash, VscClippy } from 'react-icons/vsc';

interface ClipboardHistoryProps {
  onClose: () => void;
  onPaste?: (text: string) => void;
}

const MAX_HISTORY = 30;

// Global clipboard history persisted in memory across renders
let globalHistory: { id: number; text: string; timestamp: number }[] = [];
let nextHistoryId = 1;

export function addToClipboardHistory(text: string) {
  if (!text.trim()) return;
  // Deduplicate
  globalHistory = globalHistory.filter(h => h.text !== text);
  globalHistory.unshift({ id: nextHistoryId++, text, timestamp: Date.now() });
  if (globalHistory.length > MAX_HISTORY) globalHistory.pop();
}

const ClipboardHistory: React.FC<ClipboardHistoryProps> = ({ onClose, onPaste }) => {
  const [history, setHistory] = useState(globalHistory);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setHistory([...globalHistory]);
  }, []);

  const filtered = filter.trim()
    ? history.filter(h => h.text.toLowerCase().includes(filter.toLowerCase()))
    : history;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDelete = (id: number) => {
    globalHistory = globalHistory.filter(h => h.id !== id);
    setHistory([...globalHistory]);
  };

  const handleClear = () => {
    globalHistory = [];
    setHistory([]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const truncate = (s: string, max: number) =>
    s.length > max ? s.slice(0, max) + '...' : s;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 480, maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
        <div className="dialog__header">
          <VscClippy style={{ marginRight: 8 }} />
          <span className="dialog__title">Clipboard History</span>
          <button className="dialog__close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="dialog__body" style={{ overflowY: 'auto', maxHeight: '55vh' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
            <input
              className="dialog__input"
              style={{ flex: 1 }}
              placeholder="Search..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              autoFocus
            />
            {history.length > 0 && (
              <button className="dialog__btn" onClick={handleClear} title="Clear All">
                <VscTrash />
              </button>
            )}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--subtext0)', padding: 'var(--sp-6)' }}>
              {history.length === 0 ? 'No clipboard history' : 'No matching items'}
            </div>
          )}

          {filtered.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)', marginBottom: 'var(--sp-1)',
              background: 'var(--surface0)', borderRadius: 'var(--r-sm)',
              cursor: onPaste ? 'pointer' : undefined,
            }}
              onClick={() => onPaste?.(item.text)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--fs-sm)', color: 'var(--text)',
                  fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all', maxHeight: 60, overflow: 'hidden',
                }}>
                  {truncate(item.text, 200)}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext1)', marginTop: 2 }}>
                  {formatTime(item.timestamp)} · {item.text.length} chars
                </div>
              </div>
              <button className="tree-item__action" onClick={(e) => { e.stopPropagation(); handleCopy(item.text); }} title="Copy">
                <VscCopy />
              </button>
              <button className="tree-item__action" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} title="Delete">
                <VscTrash />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClipboardHistory;
