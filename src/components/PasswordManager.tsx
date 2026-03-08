import React, { useState, useEffect, useCallback } from 'react';
import { VscLock, VscTrash, VscAdd, VscEye, VscEyeClosed, VscCopy } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { CredentialEntry } from '../types';

interface PasswordManagerProps {
  onClose: () => void;
  onSelectCredential?: (username: string, password: string) => void;
}

const PasswordManager: React.FC<PasswordManagerProps> = ({ onClose, onSelectCredential }) => {
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState('');
  const [notes, setNotes] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await invoke<CredentialEntry[]>('load_credentials');
      setCredentials(list);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!label.trim() || !username.trim()) return;
    try {
      await invoke('save_credential', {
        label: label.trim(),
        username: username.trim(),
        password,
        host: host.trim() || null,
        notes: notes.trim() || null,
      });
      setLabel(''); setUsername(''); setPassword(''); setHost(''); setNotes('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_credential', { id });
      load();
    } catch (err) {
      setError(String(err));
    }
  };

  const toggleVisible = async (id: string) => {
    if (visiblePasswords.has(id)) {
      setVisiblePasswords(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDecryptedPasswords(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      try {
        const pw = await getPassword(id);
        setDecryptedPasswords(prev => ({ ...prev, [id]: pw }));
        setVisiblePasswords(prev => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        // Auto-hide password after 10 seconds
        setTimeout(() => {
          setVisiblePasswords(p => {
            const updated = new Set(p);
            updated.delete(id);
            return updated;
          });
          setDecryptedPasswords(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 10000);
      } catch (err) {
        setError(String(err));
      }
    }
  };

  // Copy password to clipboard with auto-clear after 10 seconds
  const copyPassword = async (credId: string) => {
    try {
      const password = await invoke<string>('get_credential_password', { id: credId });
      await navigator.clipboard.writeText(password);
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
      }, 10000);
    } catch (err) {
      setError(String(err));
    }
  };

  // Get decrypted password for use/display operations
  const getPassword = async (credId: string): Promise<string> => {
    return invoke<string>('get_credential_password', { id: credId });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 520, maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="dialog__header">
          <VscLock style={{ marginRight: 8 }} />
          <span className="dialog__title">Password Manager</span>
          <button className="dialog__close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="dialog__body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {error && <div style={{ color: '#f38ba8', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-2)' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-3)' }}>
            <button className="dialog__btn dialog__btn--primary" onClick={() => setShowForm(!showForm)}>
              <VscAdd style={{ marginRight: 4 }} /> {showForm ? 'Cancel' : 'New Credential'}
            </button>
          </div>

          {showForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', padding: 'var(--sp-3)', background: 'var(--surface0)', borderRadius: 'var(--r-md)' }}>
              <input className="dialog__input" placeholder="Label (e.g. Production Server)" value={label} onChange={e => setLabel(e.target.value)} />
              <input className="dialog__input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
              <input className="dialog__input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
              <input className="dialog__input" placeholder="Host (optional)" value={host} onChange={e => setHost(e.target.value)} />
              <input className="dialog__input" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
              <button className="dialog__btn dialog__btn--primary" onClick={handleSave}>Save</button>
            </div>
          )}

          {credentials.length === 0 && !showForm && (
            <div style={{ textAlign: 'center', color: 'var(--subtext0)', padding: 'var(--sp-6)' }}>
              No saved credentials
            </div>
          )}

          {credentials.map(cred => (
            <div key={cred.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)', marginBottom: 'var(--sp-1)',
              background: 'var(--surface0)', borderRadius: 'var(--r-sm)',
            }}>
              <VscLock style={{ color: 'var(--mauve)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)' }}>{cred.label}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)' }}>
                  {cred.username}{cred.host ? ` @ ${cred.host}` : ''}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext1)', fontFamily: 'monospace' }}>
                  {visiblePasswords.has(cred.id) ? (decryptedPasswords[cred.id] || '••••••••') : '••••••••'}
                </div>
                {cred.notes && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', fontStyle: 'italic' }}>{cred.notes}</div>}
              </div>
              <button className="tree-item__action" onClick={() => toggleVisible(cred.id)} title="Show Password">
                {visiblePasswords.has(cred.id) ? <VscEyeClosed /> : <VscEye />}
              </button>
              <button className="tree-item__action" onClick={() => copyPassword(cred.id)} title="Copy Password (auto-clears in 10s)">
                <VscCopy />
              </button>
              {onSelectCredential && (
                <button className="dialog__btn" style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px' }}
                  onClick={async () => {
                    try {
                      const pw = await getPassword(cred.id);
                      onSelectCredential(cred.username, pw);
                    } catch (err) { setError(String(err)); }
                  }}>
                  Use
                </button>
              )}
              <button className="tree-item__action" onClick={() => handleDelete(cred.id)} title="Delete">
                <VscTrash />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PasswordManager;
