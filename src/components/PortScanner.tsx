import React, { useState } from 'react';
import { VscSearch } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';

interface PortScanResult {
  port: number;
  open: boolean;
  service: string;
}

interface PortScannerProps {
  onClose: () => void;
}

const PortScanner: React.FC<PortScannerProps> = ({ onClose }) => {
  const [host, setHost] = useState('');
  const [startPort, setStartPort] = useState(1);
  const [endPort, setEndPort] = useState(1024);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<PortScanResult[]>([]);
  const [error, setError] = useState('');

  const handleScan = async () => {
    if (!host.trim()) return;
    setScanning(true);
    setError('');
    setResults([]);
    try {
      const res = await invoke<PortScanResult[]>('scan_ports', {
        host: host.trim(),
        startPort,
        endPort,
      });
      setResults(res);
    } catch (err: any) {
      setError(String(err));
    }
    setScanning(false);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscSearch className="dialog__header-icon" />
          <h2 className="dialog__title">Port Scanner</h2>
        </div>
        <div className="dialog__body">
          <div className="dialog__section">
            <div className="dialog__field-row">
              <div className="dialog__field dialog__field--grow">
                <label className="dialog__label">Host</label>
                <input className="dialog__input" type="text" placeholder="hostname or IP"
                  value={host} onChange={(e) => setHost(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
                  autoFocus />
              </div>
              <div className="dialog__field dialog__field--small">
                <label className="dialog__label">Start Port</label>
                <input className="dialog__input" type="number" value={startPort}
                  onChange={(e) => setStartPort(parseInt(e.target.value) || 1)} />
              </div>
              <div className="dialog__field dialog__field--small">
                <label className="dialog__label">End Port</label>
                <input className="dialog__input" type="number" value={endPort}
                  onChange={(e) => setEndPort(parseInt(e.target.value) || 1024)} />
              </div>
            </div>
          </div>

          {error && <div className="dialog__error">{error}</div>}

          {results.length > 0 && (
            <div className="dialog__section">
              <div className="dialog__section-title">Open Ports ({results.length})</div>
              <div className="port-scanner__results">
                <table className="port-scanner__table">
                  <thead>
                    <tr>
                      <th>Port</th>
                      <th>Service</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.port}>
                        <td>{r.port}</td>
                        <td>{r.service}</td>
                        <td className="port-scanner__open">Open</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!scanning && results.length === 0 && !error && host && (
            <div style={{ color: '#6c7086', textAlign: 'center', padding: '1rem' }}>
              No open ports found in range {startPort}-{endPort}
            </div>
          )}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Close</button>
          <button className="dialog__btn dialog__btn--primary" onClick={handleScan}
            disabled={scanning || !host.trim()}>
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortScanner;
