import React, { useState } from 'react';
import { VscBroadcast } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { Tab } from '../types';

interface MultiExecBarProps {
  tabs: Tab[];
  onClose: () => void;
}

const MultiExecBar: React.FC<MultiExecBarProps> = ({ tabs, onClose }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [command, setCommand] = useState('');

  const terminalTabs = tabs.filter(t => ['local', 'ssh', 'telnet', 'serial', 'ftp'].includes(t.type));

  const toggleTab = (sessionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(terminalTabs.map(t => t.sessionId)));

  const sendCommand = async () => {
    if (!command) return;
    for (const sid of selectedIds) {
      try { await invoke('write_session', { sessionId: sid, data: command + '\r' }); } catch {}
    }
    setCommand('');
  };

  return (
    <div className="multi-exec">
      <div className="multi-exec__header">
        <VscBroadcast />
        <span>Multi-Exec</span>
        <button className="multi-exec__select-all" onClick={selectAll}>Select All</button>
        <button className="multi-exec__close" onClick={onClose}>&#x2715;</button>
      </div>
      <div className="multi-exec__tabs">
        {terminalTabs.map(tab => (
          <label key={tab.id} className="multi-exec__tab">
            <input type="checkbox" checked={selectedIds.has(tab.sessionId)} onChange={() => toggleTab(tab.sessionId)} />
            <span>{tab.name}</span>
          </label>
        ))}
      </div>
      <div className="multi-exec__input-row">
        <input className="multi-exec__input" type="text" value={command} placeholder="Type command to broadcast..."
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendCommand(); }} />
        <button className="multi-exec__send" onClick={sendCommand}>Send</button>
      </div>
    </div>
  );
};

export default MultiExecBar;
