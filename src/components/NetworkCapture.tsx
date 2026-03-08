import React, { useState, useEffect, useMemo } from 'react';
import { VscRadioTower, VscRefresh } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';

interface NetworkConnection {
  protocol: string;
  local_addr: string;
  remote_addr: string;
  state: string;
  pid: string;
}

interface NetworkCaptureProps {
  onClose: () => void;
}

const NetworkCapture: React.FC<NetworkCaptureProps> = ({ onClose }) => {
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const fetchConnections = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invoke<NetworkConnection[]>('get_network_connections');
      setConnections(res);
    } catch (err: any) {
      setError(String(err));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return connections;
    const q = filter.toLowerCase();
    return connections.filter(
      (c) =>
        c.protocol.toLowerCase().includes(q) ||
        c.local_addr.toLowerCase().includes(q) ||
        c.remote_addr.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.pid.toLowerCase().includes(q)
    );
  }, [connections, filter]);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscRadioTower className="dialog__header-icon" />
          <h2 className="dialog__title">Network Connections</h2>
          <button
            className="dialog__btn dialog__btn--icon"
            onClick={fetchConnections}
            disabled={loading}
            title="Refresh"
          >
            <VscRefresh className={loading ? 'network-capture__spin' : ''} />
          </button>
        </div>
        <div className="dialog__body">
          <div className="dialog__section">
            <div className="dialog__field">
              <input
                className="dialog__input"
                type="text"
                placeholder="Filter (protocol, address, state, PID)"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {error && <div className="dialog__error">{error}</div>}

          {loading && connections.length === 0 && (
            <div style={{ color: '#6c7086', textAlign: 'center', padding: '1rem' }}>
              Loading connections...
            </div>
          )}

          {filtered.length > 0 && (
            <div className="dialog__section">
              <div className="dialog__section-title">
                Connections ({filtered.length})
              </div>
              <div className="network-capture__results">
                <table className="network-capture__table">
                  <thead>
                    <tr>
                      <th>Protocol</th>
                      <th>Local Address</th>
                      <th>Remote Address</th>
                      <th>State</th>
                      <th>PID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => (
                      <tr key={`${c.protocol}-${c.local_addr}-${c.pid}-${i}`}>
                        <td>{c.protocol}</td>
                        <td>{c.local_addr}</td>
                        <td>{c.remote_addr}</td>
                        <td>{c.state}</td>
                        <td>{c.pid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && filtered.length === 0 && !error && (
            <div style={{ color: '#6c7086', textAlign: 'center', padding: '1rem' }}>
              {connections.length === 0
                ? 'No connections found'
                : 'No connections match the filter'}
            </div>
          )}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="dialog__btn dialog__btn--primary"
            onClick={fetchConnections}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NetworkCapture;
