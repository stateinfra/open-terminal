import React, { useState, useEffect, useCallback } from 'react';
import { VscSymbolVariable, VscTrash, VscAdd } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';

interface EnvPreset {
  id: string;
  name: string;
  variables: Record<string, string>;
}

interface EnvVarManagerProps {
  onClose: () => void;
  onApply?: (vars: Record<string, string>) => void;
}

const EnvVarManager: React.FC<EnvVarManagerProps> = ({ onClose, onApply }) => {
  const [presets, setPresets] = useState<EnvPreset[]>([]);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await invoke<EnvPreset[]>('load_env_presets');
      setPresets(list);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!name.trim()) return;
    const variables: Record<string, string> = {};
    for (const r of rows) {
      if (r.key.trim()) variables[r.key.trim()] = r.value;
    }
    await invoke('save_env_preset', { name: name.trim(), variables });
    setName(''); setRows([{ key: '', value: '' }]); setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await invoke('delete_env_preset', { id });
    load();
  };

  const handleApply = (preset: EnvPreset) => {
    if (onApply) {
      onApply(preset.variables);
      onClose();
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 520, maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="dialog__header">
          <VscSymbolVariable style={{ marginRight: 8 }} />
          <span className="dialog__title">Environment Presets</span>
          <button className="dialog__close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="dialog__body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-3)' }}>
            <button className="dialog__btn dialog__btn--primary" onClick={() => setShowForm(!showForm)}>
              <VscAdd style={{ marginRight: 4 }} /> {showForm ? 'Cancel' : 'New Preset'}
            </button>
          </div>

          {showForm && (
            <div style={{ padding: 'var(--sp-3)', background: 'var(--surface0)', borderRadius: 'var(--r-md)', marginBottom: 'var(--sp-3)' }}>
              <input className="dialog__input" placeholder="Preset Name" value={name}
                onChange={e => setName(e.target.value)} style={{ marginBottom: 'var(--sp-2)' }} />
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--sp-1)', marginBottom: 'var(--sp-1)' }}>
                  <input className="dialog__input" style={{ flex: 1 }} placeholder="KEY"
                    value={r.key} onChange={e => { const n = [...rows]; n[i].key = e.target.value; setRows(n); }} />
                  <input className="dialog__input" style={{ flex: 2 }} placeholder="VALUE"
                    value={r.value} onChange={e => { const n = [...rows]; n[i].value = e.target.value; setRows(n); }} />
                  <button className="tree-item__action" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <VscTrash />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                <button className="dialog__btn" onClick={() => setRows([...rows, { key: '', value: '' }])}>+ Add Variable</button>
                <button className="dialog__btn dialog__btn--primary" onClick={handleSave}>Save</button>
              </div>
            </div>
          )}

          {presets.length === 0 && !showForm && (
            <div style={{ textAlign: 'center', color: 'var(--subtext0)', padding: 'var(--sp-6)' }}>
              No saved presets
            </div>
          )}

          {presets.map(p => (
            <div key={p.id} style={{
              padding: 'var(--sp-2) var(--sp-3)', marginBottom: 'var(--sp-1)',
              background: 'var(--surface0)', borderRadius: 'var(--r-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{p.name}</span>
                <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                  {onApply && (
                    <button className="dialog__btn" style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px' }}
                      onClick={() => handleApply(p)}>Apply</button>
                  )}
                  <button className="tree-item__action" onClick={() => handleDelete(p.id)}><VscTrash /></button>
                </div>
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', fontFamily: 'monospace', marginTop: 4 }}>
                {Object.entries(p.variables).map(([k, v]) => (
                  <div key={k}>{k}={v}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EnvVarManager;
