import React, { useState } from 'react';
import { VscRadioTower } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';

interface WolDialogProps {
  onClose: () => void;
}

const WolDialog: React.FC<WolDialogProps> = ({ onClose }) => {
  const [mac, setMac] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!mac.trim()) return;
    setStatus('idle');
    setError('');
    try {
      await invoke('send_wol', { macAddress: mac.trim() });
      setStatus('sent');
    } catch (err: any) {
      setError(String(err));
      setStatus('error');
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscRadioTower className="dialog__header-icon" />
          <h2 className="dialog__title">Wake-on-LAN</h2>
        </div>
        <div className="dialog__body">
          <div className="dialog__section">
            <div className="dialog__field">
              <label className="dialog__label">MAC Address</label>
              <input className="dialog__input" type="text"
                placeholder="AA:BB:CC:DD:EE:FF"
                value={mac} onChange={(e) => setMac(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                autoFocus />
            </div>
          </div>
          {status === 'sent' && (
            <div style={{ color: '#a6e3a1', padding: '0.5rem 0', fontSize: '0.85rem' }}>
              Magic packet sent to {mac}
            </div>
          )}
          {error && <div className="dialog__error">{error}</div>}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Close</button>
          <button className="dialog__btn dialog__btn--primary" onClick={handleSend}
            disabled={!mac.trim()}>
            Send WOL Packet
          </button>
        </div>
      </div>
    </div>
  );
};

export default WolDialog;
