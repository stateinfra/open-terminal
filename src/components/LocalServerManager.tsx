import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VscServer, VscAdd, VscTrash, VscGlobe } from 'react-icons/vsc';

interface LocalServerManagerProps {
  onClose: () => void;
}

interface ServerEntry {
  id: string;
  port: number;
  rootPath: string;
}

export default function LocalServerManager({ onClose }: LocalServerManagerProps) {
  const [rootPath, setRootPath] = useState('');
  const [port, setPort] = useState('');
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleStartServer = async () => {
    setError(null);

    const portNumber = parseInt(port, 10);
    if (!rootPath.trim()) {
      setError('Please enter root directory path.');
      return;
    }
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
      setError('Please enter a valid port (1-65535).');
      return;
    }

    try {
      const serverId = await invoke<string>('start_http_server', {
        rootPath: rootPath.trim(),
        port: portNumber,
      });

      setServers((prev) => [
        ...prev,
        { id: serverId, port: portNumber, rootPath: rootPath.trim() },
      ]);
      setRootPath('');
      setPort('');
    } catch (err) {
      setError(`Server start failed: ${err}`);
    }
  };

  const handleStopServer = async (serverId: string) => {
    setError(null);

    try {
      await invoke('stop_http_server', { serverId });
      setServers((prev) => prev.filter((s) => s.id !== serverId));
    } catch (err) {
      setError(`Server stop failed: ${err}`);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscGlobe />
          <span>Local HTTP Server</span>
        </div>

        <div className="dialog__body">
          <div className="local-server-manager">
            <div className="local-server-manager__form">
              <div className="local-server-manager__field">
                <label className="local-server-manager__label">Root Directory</label>
                <input
                  className="local-server-manager__input"
                  type="text"
                  value={rootPath}
                  onChange={(e) => setRootPath(e.target.value)}
                  placeholder="/path/to/directory"
                />
              </div>

              <div className="local-server-manager__field">
                <label className="local-server-manager__label">Port</label>
                <input
                  className="local-server-manager__input"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="8080"
                  min={1}
                  max={65535}
                />
              </div>

              <button
                className="local-server-manager__start-button"
                onClick={handleStartServer}
              >
                <VscAdd />
                <span>Start Server</span>
              </button>
            </div>

            {error && (
              <div className="local-server-manager__error">{error}</div>
            )}

            <div className="local-server-manager__list">
              <div className="local-server-manager__list-header">
                <VscServer />
                <span>Running Servers</span>
              </div>

              {servers.length === 0 ? (
                <div className="local-server-manager__empty">
                  No running servers
                </div>
              ) : (
                servers.map((server) => (
                  <div key={server.id} className="local-server-manager__item">
                    <div className="local-server-manager__item-info">
                      <span className="local-server-manager__item-port">
                        :{server.port}
                      </span>
                      <span className="local-server-manager__item-path">
                        {server.rootPath}
                      </span>
                    </div>
                    <button
                      className="local-server-manager__stop-button"
                      onClick={() => handleStopServer(server.id)}
                      title="Stop Server"
                    >
                      <VscTrash />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dialog__footer">
          <button className="dialog__close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
