import React, { useState, useEffect, useCallback } from 'react';
import { VscSymbolClass, VscTrash, VscAdd, VscPlay } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';

interface ConnectionTemplate {
  id: string;
  name: string;
  session_type: string;
  host_pattern?: string;
  port?: number;
  username_pattern?: string;
  auth_type?: string;
  identity_file?: string;
  group?: string;
  variables: string[];
}

interface TemplateManagerProps {
  onClose: () => void;
  onUseTemplate?: (params: { host: string; port: number; username: string; name: string }) => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ onClose, onUseTemplate }) => {
  const [templates, setTemplates] = useState<ConnectionTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [hostPattern, setHostPattern] = useState('{{host}}.example.com');
  const [port, setPort] = useState(22);
  const [usernamePattern, setUsernamePattern] = useState('{{user}}');
  const [group, setGroup] = useState('');
  const [varInputs, setVarInputs] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(async () => {
    try {
      const list = await invoke<ConnectionTemplate[]>('load_templates');
      setTemplates(list);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const extractVars = (pattern: string): string[] => {
    const matches = pattern.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const allVars = [
      ...extractVars(hostPattern),
      ...extractVars(usernamePattern),
    ];
    const template: ConnectionTemplate = {
      id: '',
      name: name.trim(),
      session_type: 'ssh',
      host_pattern: hostPattern,
      port,
      username_pattern: usernamePattern,
      auth_type: 'password',
      identity_file: undefined,
      group: group.trim() || undefined,
      variables: [...new Set(allVars)],
    };
    await invoke('save_template', { template });
    setName(''); setHostPattern('{{host}}.example.com'); setUsernamePattern('{{user}}');
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await invoke('delete_template', { id });
    load();
  };

  const handleUse = (tmpl: ConnectionTemplate) => {
    const inputs = varInputs[tmpl.id] || {};
    let host = tmpl.host_pattern || '';
    let username = tmpl.username_pattern || '';
    for (const v of tmpl.variables) {
      const val = inputs[v] || '';
      host = host.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), val);
      username = username.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), val);
    }
    onUseTemplate?.({ host, port: tmpl.port || 22, username, name: `${tmpl.name}: ${host}` });
    onClose();
  };

  const updateVarInput = (tmplId: string, varName: string, value: string) => {
    setVarInputs(prev => ({
      ...prev,
      [tmplId]: { ...prev[tmplId], [varName]: value },
    }));
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 540, maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="dialog__header">
          <VscSymbolClass style={{ marginRight: 8 }} />
          <span className="dialog__title">Connection Templates</span>
          <button className="dialog__close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="dialog__body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-3)' }}>
            <button className="dialog__btn dialog__btn--primary" onClick={() => setShowForm(!showForm)}>
              <VscAdd style={{ marginRight: 4 }} /> {showForm ? 'Cancel' : 'New Template'}
            </button>
          </div>

          {showForm && (
            <div style={{ padding: 'var(--sp-3)', background: 'var(--surface0)', borderRadius: 'var(--r-md)', marginBottom: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <input className="dialog__input" placeholder="Template Name (e.g. AWS Production)" value={name} onChange={e => setName(e.target.value)} />
              <input className="dialog__input" placeholder="Host Pattern (e.g. {{host}}.example.com)" value={hostPattern} onChange={e => setHostPattern(e.target.value)} />
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <input className="dialog__input" style={{ flex: 1 }} placeholder="Username Pattern (e.g. {{user}})" value={usernamePattern} onChange={e => setUsernamePattern(e.target.value)} />
                <input className="dialog__input" style={{ width: 80 }} type="number" placeholder="Port" value={port} onChange={e => setPort(parseInt(e.target.value) || 22)} />
              </div>
              <input className="dialog__input" placeholder="Group (optional)" value={group} onChange={e => setGroup(e.target.value)} />
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)' }}>
                Use {'{{variable}}'} syntax for variables. Values will be prompted on connect.
              </div>
              <button className="dialog__btn dialog__btn--primary" onClick={handleSave}>Save</button>
            </div>
          )}

          {templates.length === 0 && !showForm && (
            <div style={{ textAlign: 'center', color: 'var(--subtext0)', padding: 'var(--sp-6)' }}>
              No saved templates
            </div>
          )}

          {templates.map(tmpl => (
            <div key={tmpl.id} style={{
              padding: 'var(--sp-3)', marginBottom: 'var(--sp-2)',
              background: 'var(--surface0)', borderRadius: 'var(--r-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{tmpl.name}</span>
                <button className="tree-item__action" onClick={() => handleDelete(tmpl.id)}><VscTrash /></button>
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', fontFamily: 'monospace', marginBottom: 'var(--sp-2)' }}>
                {tmpl.username_pattern}@{tmpl.host_pattern}:{tmpl.port}
              </div>
              {tmpl.variables.length > 0 && onUseTemplate && (
                <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' }}>
                  {tmpl.variables.map(v => (
                    <input key={v} className="dialog__input" style={{ width: 120, fontSize: 'var(--fs-xs)' }}
                      placeholder={v}
                      value={varInputs[tmpl.id]?.[v] || ''}
                      onChange={e => updateVarInput(tmpl.id, v, e.target.value)} />
                  ))}
                  <button className="dialog__btn dialog__btn--primary" style={{ padding: '4px 12px', fontSize: 'var(--fs-xs)' }}
                    onClick={() => handleUse(tmpl)}>
                    <VscPlay style={{ marginRight: 4 }} /> Connect
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TemplateManager;
