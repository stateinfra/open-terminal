import React, { useState, useEffect, useCallback } from 'react';
import { VscKey, VscAdd, VscCopy } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { SshKeyResult } from '../types';

interface SshKeyManagerProps {
  onClose: () => void;
}

const SshKeyManager: React.FC<SshKeyManagerProps> = ({ onClose }) => {
  const [keys, setKeys] = useState<string[]>([]);
  const [showGen, setShowGen] = useState(false);
  const [keyType, setKeyType] = useState('ed25519');
  const [bits, setBits] = useState(4096);
  const [comment, setComment] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState<SshKeyResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const list = await invoke<string[]>('list_ssh_keys');
      setKeys(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleGenerate = async () => {
    setError('');
    setResult(null);
    try {
      const r = await invoke<SshKeyResult>('generate_ssh_key', {
        keyType,
        bits: keyType === 'rsa' ? bits : null,
        comment: comment || null,
        passphrase: passphrase || null,
        filename: filename || null,
      });
      setResult(r);
      loadKeys();
    } catch (err: any) {
      setError(String(err));
    }
  };

  const copyPublicKey = () => {
    if (result) {
      navigator.clipboard.writeText(result.public_key_content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscKey className="dialog__header-icon" />
          <h2 className="dialog__title">SSH Key Manager</h2>
        </div>
        <div className="dialog__body">
          {/* Existing keys */}
          <div className="dialog__section">
            <div className="dialog__section-title">Existing Keys ({keys.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', maxHeight: '8rem', overflowY: 'auto' }}>
              {keys.map((k) => (
                <div key={k} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                  padding: 'var(--sp-2)', background: 'var(--surface0)', borderRadius: 'var(--r-sm)',
                  fontSize: 'var(--fs-sm)', fontFamily: 'var(--font-mono)', color: 'var(--subtext1)',
                }}>
                  <VscKey style={{ color: 'var(--yellow)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                </div>
              ))}
              {keys.length === 0 && (
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--overlay0)', padding: 'var(--sp-2)' }}>
                  No SSH keys found in ~/.ssh/
                </div>
              )}
            </div>
          </div>

          {/* Generate */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
            <div className="dialog__section-title" style={{ margin: 0, border: 'none', padding: 0 }}>Generate New Key</div>
            {!showGen && (
              <button className="dialog__btn dialog__btn--primary" onClick={() => setShowGen(true)}>
                <VscAdd /> Generate
              </button>
            )}
          </div>

          {showGen && (
            <div style={{ background: 'var(--surface0)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
              <div className="dialog__field-row">
                <div className="dialog__field dialog__field--grow">
                  <label className="dialog__label">Key Type</label>
                  <select className="dialog__input" value={keyType} onChange={(e) => setKeyType(e.target.value)}>
                    <option value="ed25519">Ed25519 (recommended)</option>
                    <option value="rsa">RSA</option>
                    <option value="ecdsa">ECDSA</option>
                  </select>
                </div>
                {keyType === 'rsa' && (
                  <div className="dialog__field dialog__field--small">
                    <label className="dialog__label">Bits</label>
                    <select className="dialog__input" value={bits} onChange={(e) => setBits(+e.target.value)}>
                      <option value={2048}>2048</option>
                      <option value={4096}>4096</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="dialog__field">
                <label className="dialog__label">Comment (optional)</label>
                <input className="dialog__input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="user@host" />
              </div>
              <div className="dialog__field-row">
                <div className="dialog__field dialog__field--grow">
                  <label className="dialog__label">Passphrase (optional)</label>
                  <input className="dialog__input" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                </div>
                <div className="dialog__field dialog__field--grow">
                  <label className="dialog__label">Filename (optional)</label>
                  <input className="dialog__input" value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="id_ed25519" />
                </div>
              </div>
              {error && <div className="dialog__error">{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
                <button className="dialog__btn dialog__btn--secondary" onClick={() => setShowGen(false)}>Cancel</button>
                <button className="dialog__btn dialog__btn--primary" onClick={handleGenerate}>Generate Key</button>
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 'var(--sp-3)', background: 'var(--surface0)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--green)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
                Key generated successfully!
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', marginBottom: 'var(--sp-1)' }}>
                Private: {result.private_key_path}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', marginBottom: 'var(--sp-2)' }}>
                Public: {result.public_key_path}
              </div>
              <div style={{ position: 'relative' }}>
                <pre style={{
                  background: 'var(--crust)', padding: 'var(--sp-2)', borderRadius: 'var(--r-sm)',
                  fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text)',
                  overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {result.public_key_content}
                </pre>
                <button
                  onClick={copyPublicKey}
                  style={{
                    position: 'absolute', top: 'var(--sp-1)', right: 'var(--sp-1)',
                    background: 'var(--surface1)', border: 'none', color: copied ? 'var(--green)' : 'var(--subtext0)',
                    padding: '4px 8px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                    fontSize: 'var(--fs-xs)', display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <VscCopy /> {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default SshKeyManager;
