import React, { useState, useEffect, useCallback } from 'react';
import { VscAdd, VscTrash, VscDebugDisconnect, VscLock } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { TunnelInfo } from '../types';

interface TunnelManagerProps {
  onClose: () => void;
}

const TunnelManager: React.FC<TunnelManagerProps> = ({ onClose }) => {
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keyPath, setKeyPath] = useState('');
  const [localPort, setLocalPort] = useState(8080);
  const [remoteHost, setRemoteHost] = useState('127.0.0.1');
  const [remotePort, setRemotePort] = useState(80);
  const [error, setError] = useState('');

  const loadTunnels = useCallback(async () => {
    try {
      const list = await invoke<TunnelInfo[]>('list_tunnels');
      setTunnels(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTunnels();
    const interval = setInterval(loadTunnels, 3000);
    return () => clearInterval(interval);
  }, [loadTunnels]);

  const handleCreate = async () => {
    setError('');
    try {
      await invoke('create_ssh_tunnel', {
        host, port, username,
        password: password || null,
        keyPath: keyPath || null,
        localPort, remoteHost, remotePort,
      });
      setShowForm(false);
      loadTunnels();
    } catch (err: any) {
      setError(String(err));
    }
  };

  const handleClose = async (id: string) => {
    try {
      await invoke('close_tunnel', { tunnelId: id });
      loadTunnels();
    } catch { /* ignore */ }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscLock className="dialog__header-icon" />
          <h2 className="dialog__title">SSH Tunnel Manager</h2>
        </div>
        <div className="dialog__body">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--subtext0)' }}>
              Active Tunnels: {tunnels.length}
            </span>
            <button className="dialog__btn dialog__btn--primary" onClick={() => setShowForm(!showForm)}>
              <VscAdd /> New Tunnel
            </button>
          </div>

          {showForm && (
            <div style={{ background: 'var(--surface0)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
              <div className="dialog__section-title">SSH Server</div>
              <div className="dialog__field-row">
                <div className="dialog__field dialog__field--grow">
                  <label className="dialog__label">Host</label>
                  <input className="dialog__input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com" />
                </div>
                <div className="dialog__field dialog__field--small">
                  <label className="dialog__label">Port</label>
                  <input className="dialog__input" type="number" value={port} onChange={(e) => setPort(+e.target.value)} />
                </div>
              </div>
              <div className="dialog__field-row">
                <div className="dialog__field dialog__field--grow">
                  <label className="dialog__label">Username</label>
                  <input className="dialog__input" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className="dialog__field dialog__field--grow">
                  <label className="dialog__label">Password</label>
                  <input className="dialog__input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
              <div className="dialog__field">
                <label className="dialog__label">Key Path (optional)</label>
                <input className="dialog__input" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_rsa" />
              </div>
              <div className="dialog__section-title" style={{ marginTop: 'var(--sp-3)' }}>Tunnel</div>
              <div className="dialog__field-row">
                <div className="dialog__field dialog__field--small">
                  <label className="dialog__label">Local Port</label>
                  <input className="dialog__input" type="number" value={localPort} onChange={(e) => setLocalPort(+e.target.value)} />
                </div>
                <div className="dialog__field dialog__field--grow">
                  <label className="dialog__label">Remote Host</label>
                  <input className="dialog__input" value={remoteHost} onChange={(e) => setRemoteHost(e.target.value)} />
                </div>
                <div className="dialog__field dialog__field--small">
                  <label className="dialog__label">Remote Port</label>
                  <input className="dialog__input" type="number" value={remotePort} onChange={(e) => setRemotePort(+e.target.value)} />
                </div>
              </div>
              {error && <div className="dialog__error">{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
                <button className="dialog__btn dialog__btn--secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="dialog__btn dialog__btn--primary" onClick={handleCreate}>Create Tunnel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', maxHeight: '16rem', overflowY: 'auto' }}>
            {tunnels.map((t) => (
              <div key={t.id} className="env-hub__item">
                <VscLock style={{ color: t.status === 'active' ? 'var(--green)' : 'var(--overlay0)', fontSize: '1.1rem' }} />
                <div className="env-hub__item-info">
                  <div className="env-hub__item-name">
                    localhost:{t.local_port} → {t.remote_host}:{t.remote_port}
                  </div>
                  <div className="env-hub__item-detail">
                    Status: {t.status}
                  </div>
                </div>
                <button className="dialog__btn dialog__btn--secondary" onClick={() => handleClose(t.id)} style={{ padding: '0.25rem 0.5rem' }}>
                  <VscDebugDisconnect /> Close
                </button>
              </div>
            ))}
            {tunnels.length === 0 && (
              <div className="env-hub__empty">No active tunnels</div>
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

export default TunnelManager;
