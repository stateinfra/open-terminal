import React, { useState, useEffect, useCallback } from 'react';
import { VscCode, VscTrash, VscAdd, VscPlay, VscCopy } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { Snippet } from '../types';

interface SnippetManagerProps {
  onClose: () => void;
  onRunSnippet?: (command: string) => void;
}

const SnippetManager: React.FC<SnippetManagerProps> = ({ onClose, onRunSnippet }) => {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const loaded = await invoke<Snippet[]>('load_snippets');
      setSnippets(loaded);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing || !editing.name.trim() || !editing.command.trim()) return;
    const snippet: Snippet = {
      ...editing,
      id: editing.id || `snip-${Date.now()}`,
    };
    await invoke('save_snippet', { snippet });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await invoke('delete_snippet', { id });
    load();
  };

  const filtered = snippets.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.command.toLowerCase().includes(filter.toLowerCase()) ||
    s.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscCode className="dialog__header-icon" />
          <h2 className="dialog__title">Script Snippets</h2>
        </div>
        <div className="dialog__body">
          <div className="snippet-mgr__toolbar">
            <input className="dialog__input snippet-mgr__search" type="text"
              placeholder="Filter snippets..." value={filter}
              onChange={(e) => setFilter(e.target.value)} />
            <button className="dialog__btn dialog__btn--primary snippet-mgr__add-btn"
              onClick={() => setEditing({ id: '', name: '', description: '', command: '', tags: [] })}>
              <VscAdd /> New
            </button>
          </div>

          {editing && (
            <div className="snippet-mgr__edit">
              <div className="dialog__field">
                <label className="dialog__label">Name</label>
                <input className="dialog__input" type="text" value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
              </div>
              <div className="dialog__field">
                <label className="dialog__label">Description</label>
                <input className="dialog__input" type="text" value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="dialog__field">
                <label className="dialog__label">Command</label>
                <textarea className="dialog__input snippet-mgr__textarea" value={editing.command}
                  onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                  rows={4} />
              </div>
              <div className="dialog__field">
                <label className="dialog__label">Tags (comma-separated)</label>
                <input className="dialog__input" type="text"
                  value={editing.tags.join(', ')}
                  onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
              </div>
              <div className="snippet-mgr__edit-actions">
                <button className="dialog__btn dialog__btn--secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button className="dialog__btn dialog__btn--primary" onClick={handleSave}>Save</button>
              </div>
            </div>
          )}

          <div className="snippet-mgr__list">
            {filtered.map((s) => (
              <div key={s.id} className="snippet-mgr__item">
                <div className="snippet-mgr__item-info">
                  <div className="snippet-mgr__item-name">{s.name}</div>
                  {s.description && <div className="snippet-mgr__item-desc">{s.description}</div>}
                  <code className="snippet-mgr__item-cmd">{s.command}</code>
                  {s.tags.length > 0 && (
                    <div className="snippet-mgr__item-tags">
                      {s.tags.map((t) => <span key={t} className="snippet-mgr__tag">{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="snippet-mgr__item-actions">
                  {onRunSnippet && (
                    <button className="tree-item__action" title="Run" onClick={() => onRunSnippet(s.command)}>
                      <VscPlay />
                    </button>
                  )}
                  <button className="tree-item__action" title="Copy" onClick={() => navigator.clipboard.writeText(s.command)}>
                    <VscCopy />
                  </button>
                  <button className="tree-item__action" title="Edit" onClick={() => setEditing(s)}>
                    <VscCode />
                  </button>
                  <button className="tree-item__action" title="Delete" onClick={() => handleDelete(s.id)}>
                    <VscTrash />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && !editing && (
              <div style={{ color: '#6c7086', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
                No snippets yet. Click "New" to create one.
              </div>
            )}
          </div>
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default SnippetManager;
