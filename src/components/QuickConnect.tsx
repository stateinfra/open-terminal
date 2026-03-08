import React, { useState, useRef, useEffect } from 'react';
import { VscRemoteExplorer, VscCircleFilled } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { HealthResult } from '../types';

interface QuickConnectProps {
  onConnect: (host: string, port: number, username: string) => void;
  onClose: () => void;
}

const QuickConnect: React.FC<QuickConnectProps> = ({ onConnect, onClose }) => {
  const [input, setInput] = useState('');
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Parse input like "user@host:port" or "host" or "user@host"
  const parseInput = (val: string) => {
    let username = 'root';
    let host = val.trim();
    let port = 22;

    if (host.includes('@')) {
      const [u, rest] = host.split('@');
      username = u;
      host = rest;
    }
    if (host.includes(':')) {
      const [h, p] = host.split(':');
      host = h;
      port = parseInt(p) || 22;
    }
    return { username, host, port };
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    setHealth(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const { host } = parseInput(val);
    if (host && host.length > 2) {
      debounceRef.current = setTimeout(async () => {
        setChecking(true);
        try {
          const result = await invoke<HealthResult>('check_host_health', { host, port: null });
          setHealth(result);
        } catch { /* ignore */ }
        setChecking(false);
      }, 600);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { username, host, port } = parseInput(input);
    if (!host) return;
    onConnect(host, port, username);
    onClose();
  };

  return (
    <div className="quick-connect">
      <form onSubmit={handleSubmit} className="quick-connect__form">
        <VscRemoteExplorer className="quick-connect__icon" />
        <input ref={inputRef} className="quick-connect__input" type="text"
          placeholder="user@host:port (e.g. root@192.168.1.1:22)"
          value={input} onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />
        {(checking || health) && (
          <span className="quick-connect__health">
            {checking ? (
              <VscCircleFilled className="quick-connect__health-icon quick-connect__health-icon--checking" />
            ) : health?.reachable ? (
              <>
                <VscCircleFilled className="quick-connect__health-icon quick-connect__health-icon--ok" />
                <span className="quick-connect__latency">{health.latency_ms}ms</span>
              </>
            ) : (
              <VscCircleFilled className="quick-connect__health-icon quick-connect__health-icon--fail" />
            )}
          </span>
        )}
        <button type="submit" className="quick-connect__go" disabled={!parseInput(input).host}>
          Connect
        </button>
      </form>
    </div>
  );
};

export default QuickConnect;
