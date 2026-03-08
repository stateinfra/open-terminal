import React, { useState } from 'react';
import { VscRadioTower } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';

interface NetworkToolsProps {
  onClose: () => void;
}

type ToolType = 'ping' | 'traceroute' | 'nslookup';

const NetworkTools: React.FC<NetworkToolsProps> = ({ onClose }) => {
  const [tool, setTool] = useState<ToolType>('ping');
  const [host, setHost] = useState('');
  const [count, setCount] = useState(4);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!host.trim()) return;
    setLoading(true);
    setResult('');
    try {
      let output = '';
      if (tool === 'ping') {
        output = await invoke<string>('run_ping', { host: host.trim(), count });
      } else if (tool === 'traceroute') {
        output = await invoke<string>('run_traceroute', { host: host.trim() });
      } else {
        output = await invoke<string>('run_nslookup', { host: host.trim() });
      }
      setResult(output);
    } catch (err: any) {
      setResult(`Error: ${err}`);
    }
    setLoading(false);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscRadioTower className="dialog__header-icon" />
          <h2 className="dialog__title">Network Tools</h2>
        </div>
        <div className="dialog__body">
          <div className="env-hub__tabs" style={{ marginBottom: 'var(--sp-3)' }}>
            {(['ping', 'traceroute', 'nslookup'] as ToolType[]).map((t) => (
              <button
                key={t}
                className={`env-hub__tab ${tool === t ? 'env-hub__tab--active' : ''}`}
                onClick={() => { setTool(t); setResult(''); }}
              >
                {t === 'ping' ? 'Ping' : t === 'traceroute' ? 'Traceroute' : 'DNS Lookup'}
              </button>
            ))}
          </div>

          <div className="dialog__field-row">
            <div className="dialog__field dialog__field--grow">
              <label className="dialog__label">Host / IP</label>
              <input
                className="dialog__input"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="example.com or 8.8.8.8"
                onKeyDown={(e) => e.key === 'Enter' && handleRun()}
              />
            </div>
            {tool === 'ping' && (
              <div className="dialog__field dialog__field--small">
                <label className="dialog__label">Count</label>
                <input className="dialog__input" type="number" value={count} onChange={(e) => setCount(+e.target.value)} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-3)' }}>
            <button className="dialog__btn dialog__btn--primary" onClick={handleRun} disabled={loading || !host.trim()}>
              {loading ? 'Running...' : 'Run'}
            </button>
          </div>

          {result && (
            <pre style={{
              background: 'var(--crust)', color: 'var(--text)',
              padding: 'var(--sp-3)', borderRadius: 'var(--r-md)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)',
              maxHeight: '20rem', overflowY: 'auto', whiteSpace: 'pre-wrap',
              lineHeight: 1.5, border: '1px solid var(--surface0)',
            }}>
              {result}
            </pre>
          )}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default NetworkTools;
