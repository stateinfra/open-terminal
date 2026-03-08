import React, { useState } from 'react';
import { VscEdit } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { SavedSession } from '../types';

interface EditSessionDialogProps {
  session: SavedSession;
  onSave: () => void;
  onClose: () => void;
}

const EditSessionDialog: React.FC<EditSessionDialogProps> = ({ session, onSave, onClose }) => {
  const [name, setName] = useState(session.name);
  const [host, setHost] = useState(session.host || '');
  const [port, setPort] = useState(session.port || 22);
  const [username, setUsername] = useState(session.username || '');
  const [authType, setAuthType] = useState(session.auth_type || 'password');
  const [identityFile, setIdentityFile] = useState(session.identity_file || '');
  const [group, setGroup] = useState(session.group || '');
  const [tags, setTags] = useState(session.tags?.join(', ') || '');
  const [color, setColor] = useState(session.color || '');
  const [error, setError] = useState('');

  const TAG_COLORS = [
    { name: 'None', value: '' },
    { name: 'Red', value: '#f38ba8' },
    { name: 'Green', value: '#a6e3a1' },
    { name: 'Blue', value: '#89b4fa' },
    { name: 'Yellow', value: '#f9e2af' },
    { name: 'Mauve', value: '#cba6f7' },
    { name: 'Peach', value: '#fab387' },
    { name: 'Teal', value: '#94e2d5' },
  ];

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    try {
      // Delete old session if name changed
      if (name !== session.name) {
        await invoke('delete_session', { name: session.name });
      }
      await invoke('save_session', {
        session: {
          ...session,
          name: name.trim(),
          host: host || undefined,
          port: port || undefined,
          username: username || undefined,
          auth_type: authType || undefined,
          identity_file: authType === 'key' ? identityFile : undefined,
          group: group.trim() || undefined,
          tags: tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
          color: color || undefined,
        },
      });
      onSave();
      onClose();
    } catch (err: any) {
      setError(String(err));
    }
  };

  const isSSH = session.session_type === 'ssh';

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscEdit className="dialog__header-icon" />
          <h2 className="dialog__title">Edit Connection</h2>
        </div>
        <div className="dialog__body">
          <div className="dialog__section">
            <div className="dialog__field">
              <label className="dialog__label">Session Name</label>
              <input className="dialog__input" type="text" value={name}
                onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="dialog__field">
              <label className="dialog__label">Group (Folder)</label>
              <input className="dialog__input" type="text" value={group}
                placeholder="e.g. Production, Staging, Development"
                onChange={(e) => setGroup(e.target.value)} />
            </div>
            <div className="dialog__field">
              <label className="dialog__label">Tags (comma separated)</label>
              <input className="dialog__input" type="text" value={tags}
                placeholder="e.g. production, aws, web-server"
                onChange={(e) => setTags(e.target.value)} />
            </div>
            <div className="dialog__field">
              <label className="dialog__label">Color</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {TAG_COLORS.map(c => (
                  <button key={c.value}
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: c.value || 'var(--surface1)',
                      border: color === c.value ? '2px solid var(--text)' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                    title={c.name}
                    onClick={() => setColor(c.value)}
                  />
                ))}
              </div>
            </div>
            {(isSSH || session.host) && (
              <>
                <div className="dialog__field-row">
                  <div className="dialog__field dialog__field--grow">
                    <label className="dialog__label">Host</label>
                    <input className="dialog__input" type="text" value={host}
                      onChange={(e) => setHost(e.target.value)} />
                  </div>
                  <div className="dialog__field dialog__field--small">
                    <label className="dialog__label">Port</label>
                    <input className="dialog__input" type="number" value={port}
                      onChange={(e) => setPort(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="dialog__field">
                  <label className="dialog__label">Username</label>
                  <input className="dialog__input" type="text" value={username}
                    onChange={(e) => setUsername(e.target.value)} />
                </div>
              </>
            )}
            {isSSH && (
              <>
                <div className="dialog__field">
                  <label className="dialog__label">Auth Method</label>
                  <select className="dialog__input" value={authType}
                    onChange={(e) => setAuthType(e.target.value)}>
                    <option value="password">Password</option>
                    <option value="key">Private Key</option>
                  </select>
                </div>
                {authType === 'key' && (
                  <div className="dialog__field">
                    <label className="dialog__label">Private Key Path</label>
                    <input className="dialog__input" type="text" value={identityFile}
                      placeholder="~/.ssh/id_rsa"
                      onChange={(e) => setIdentityFile(e.target.value)} />
                  </div>
                )}
              </>
            )}
          </div>
          {error && <div className="dialog__error">{error}</div>}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Cancel</button>
          <button className="dialog__btn dialog__btn--primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default EditSessionDialog;
