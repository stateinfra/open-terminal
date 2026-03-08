import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VscRecord, VscTrash, VscPlay, VscAdd, VscStopCircle } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { MacroEntry, MacroKeystroke } from '../types';

interface MacroManagerProps {
  onClose: () => void;
  onPlayMacro?: (keystrokes: MacroKeystroke[]) => void;
  activeSessionId?: string;
}

const MacroManager: React.FC<MacroManagerProps> = ({ onClose, onPlayMacro, activeSessionId }) => {
  const [macros, setMacros] = useState<MacroEntry[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedKeystrokes, setRecordedKeystrokes] = useState<MacroKeystroke[]>([]);
  const [macroName, setMacroName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [error, setError] = useState('');
  const lastKeyTime = useRef<number>(Date.now());

  const load = useCallback(async () => {
    try {
      const list = await invoke<MacroEntry[]>('load_macros');
      setMacros(list);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recording keyboard events
  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRecording(false);
        if (recordedKeystrokes.length > 0) setShowSaveForm(true);
        return;
      }
      e.preventDefault();
      const now = Date.now();
      const delay = now - lastKeyTime.current;
      lastKeyTime.current = now;

      let data = '';
      if (e.key === 'Enter') data = '\r';
      else if (e.key === 'Tab') data = '\t';
      else if (e.key === 'Backspace') data = '\x7f';
      else if (e.key.length === 1) data = e.key;
      else return;

      setRecordedKeystrokes(prev => [...prev, { data, delay_ms: Math.min(delay, 2000) }]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recording, recordedKeystrokes]);

  const startRecording = () => {
    setRecordedKeystrokes([]);
    lastKeyTime.current = Date.now();
    setRecording(true);
    setShowSaveForm(false);
  };

  const stopRecording = () => {
    setRecording(false);
    if (recordedKeystrokes.length > 0) setShowSaveForm(true);
  };

  const handleSave = async () => {
    if (!macroName.trim() || recordedKeystrokes.length === 0) return;
    try {
      await invoke('save_macro', { name: macroName.trim(), keystrokes: recordedKeystrokes });
      setMacroName('');
      setRecordedKeystrokes([]);
      setShowSaveForm(false);
      load();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_macro', { id });
      load();
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePlay = async (macro: MacroEntry) => {
    if (!activeSessionId || !onPlayMacro) return;
    onPlayMacro(macro.keystrokes);
  };

  const formatKeystroke = (ks: MacroKeystroke) => {
    if (ks.data === '\r') return '↵';
    if (ks.data === '\t') return '⇥';
    if (ks.data === '\x7f') return '⌫';
    return ks.data;
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 520, maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="dialog__header">
          <VscRecord style={{ marginRight: 8 }} />
          <span className="dialog__title">Macro Manager</span>
          <button className="dialog__close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="dialog__body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {error && <div style={{ color: '#f38ba8', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-2)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
            {!recording ? (
              <button className="dialog__btn dialog__btn--primary" onClick={startRecording}>
                <VscRecord style={{ marginRight: 4 }} /> Start Recording
              </button>
            ) : (
              <button className="dialog__btn" style={{ background: '#f38ba8', color: '#1e1e2e' }} onClick={stopRecording}>
                <VscStopCircle style={{ marginRight: 4 }} /> Stop Recording (or Esc)
              </button>
            )}
          </div>

          {recording && (
            <div style={{
              padding: 'var(--sp-3)', background: 'var(--surface0)', borderRadius: 'var(--r-md)',
              marginBottom: 'var(--sp-3)', border: '1px solid #f38ba8',
            }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: '#f38ba8', marginBottom: 'var(--sp-1)', fontWeight: 600 }}>
                Recording... (Esc to stop)
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {recordedKeystrokes.map((ks, i) => (
                  <span key={i} style={{ padding: '1px 3px', margin: 1, background: 'var(--surface1)', borderRadius: 2, display: 'inline-block' }}>
                    {formatKeystroke(ks)}
                  </span>
                ))}
                {recordedKeystrokes.length === 0 && <span style={{ color: 'var(--subtext1)' }}>Waiting for input...</span>}
              </div>
            </div>
          )}

          {showSaveForm && (
            <div style={{
              display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)',
              padding: 'var(--sp-3)', background: 'var(--surface0)', borderRadius: 'var(--r-md)',
            }}>
              <input className="dialog__input" style={{ flex: 1 }}
                placeholder="Macro Name" value={macroName}
                onChange={e => setMacroName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus />
              <button className="dialog__btn dialog__btn--primary" onClick={handleSave}>Save</button>
              <button className="dialog__btn" onClick={() => { setShowSaveForm(false); setRecordedKeystrokes([]); }}>Cancel</button>
            </div>
          )}

          {macros.length === 0 && !recording && !showSaveForm && (
            <div style={{ textAlign: 'center', color: 'var(--subtext0)', padding: 'var(--sp-6)' }}>
              No saved macros
            </div>
          )}

          {macros.map(macro => (
            <div key={macro.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)', marginBottom: 'var(--sp-1)',
              background: 'var(--surface0)', borderRadius: 'var(--r-sm)',
            }}>
              <VscRecord style={{ color: 'var(--red)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)' }}>{macro.name}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {macro.keystrokes.map(formatKeystroke).join('')}
                  <span style={{ marginLeft: 8, color: 'var(--subtext1)' }}>({macro.keystrokes.length} keys)</span>
                </div>
              </div>
              {onPlayMacro && activeSessionId && (
                <button className="tree-item__action" onClick={() => handlePlay(macro)} title="Play">
                  <VscPlay />
                </button>
              )}
              <button className="tree-item__action" onClick={() => handleDelete(macro.id)} title="Delete">
                <VscTrash />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MacroManager;
