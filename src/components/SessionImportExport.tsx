import React, { useState } from 'react';
import { VscCloudDownload, VscCloudUpload, VscGithubAction } from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

interface SessionImportExportProps {
  onClose: () => void;
  onImported: () => void;
}

const SessionImportExport: React.FC<SessionImportExportProps> = ({ onClose, onImported }) => {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');
    setStatus('');
    try {
      const filePath = await save({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: 'open-terminal-sessions.json',
      });
      if (!filePath) return;
      await invoke('export_sessions', { filePath });
      setStatus('Sessions exported successfully!');
    } catch (err: any) {
      setError(String(err));
    }
  };

  const handleImport = async () => {
    setError('');
    setStatus('');
    try {
      const filePath = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      });
      if (!filePath) return;
      await invoke('import_sessions', { filePath });
      setStatus('Sessions imported successfully!');
      onImported();
    } catch (err: any) {
      setError(String(err));
    }
  };

  const handleImportSshConfig = async () => {
    setError('');
    setStatus('');
    try {
      await invoke('import_ssh_config');
      setStatus('SSH config imported successfully!');
      onImported();
    } catch (err: any) {
      setError(String(err));
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscCloudDownload className="dialog__header-icon" />
          <h2 className="dialog__title">Session Import / Export</h2>
        </div>
        <div className="dialog__body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <button
              className="dialog__btn dialog__btn--primary"
              onClick={handleExport}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', justifyContent: 'center', width: '100%', padding: 'var(--sp-3)' }}
            >
              <VscCloudUpload /> Export Sessions to File
            </button>

            <button
              className="dialog__btn dialog__btn--secondary"
              onClick={handleImport}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', justifyContent: 'center', width: '100%', padding: 'var(--sp-3)' }}
            >
              <VscCloudDownload /> Import Sessions from File
            </button>

            <div style={{ borderTop: '1px solid var(--surface0)', paddingTop: 'var(--sp-3)' }}>
              <button
                className="dialog__btn dialog__btn--secondary"
                onClick={handleImportSshConfig}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', justifyContent: 'center', width: '100%', padding: 'var(--sp-3)' }}
              >
                <VscGithubAction /> Import from ~/.ssh/config
              </button>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--overlay0)', marginTop: 'var(--sp-1)', textAlign: 'center' }}>
                Reads your SSH config and imports hosts as saved sessions
              </div>
            </div>
          </div>

          {status && (
            <div style={{
              marginTop: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)',
              background: 'rgba(166, 227, 161, 0.15)', border: '1px solid var(--green)',
              borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-sm)', color: 'var(--green)',
            }}>
              {status}
            </div>
          )}
          {error && <div className="dialog__error">{error}</div>}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default SessionImportExport;
