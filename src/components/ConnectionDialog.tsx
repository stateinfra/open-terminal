import React, { useState, useEffect } from 'react';
import {
  VscRemoteExplorer, VscTerminal, VscPlug,
  VscDesktopDownload, VscScreenFull, VscFolder,
  VscCloudUpload,
} from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { PROTOCOL_INFO } from '../types';

type Protocol = 'ssh' | 'telnet' | 'rdp' | 'vnc' | 'ftp' | 'serial' | 's3';

interface ConnectionDialogProps {
  onConnect: (params: {
    host: string;
    port: number;
    username: string;
    authType: string;
    password?: string;
    identityFile?: string;
    name?: string;
  }) => void;
  onConnectTelnet: (host: string, port: number, name?: string) => void;
  onConnectSerial: (port: string, baudRate: number, name?: string) => void;
  onConnectFtp: (host: string, port: number, name?: string) => void;
  onLaunchRdp: (host: string, port?: number, username?: string) => void;
  onLaunchVnc: (host: string, port?: number) => void;
  onConnectS3: (bucket: string, region?: string, accessKey?: string, secretKey?: string, endpoint?: string, name?: string) => void;
  onClose: () => void;
}

const PROTOCOLS: { id: Protocol; icon: React.ReactNode; label: string }[] = [
  { id: 'ssh', icon: <VscRemoteExplorer />, label: 'SSH' },
  { id: 'telnet', icon: <VscTerminal />, label: 'Telnet' },
  { id: 'rdp', icon: <VscDesktopDownload />, label: 'RDP' },
  { id: 'vnc', icon: <VscScreenFull />, label: 'VNC' },
  { id: 'ftp', icon: <VscFolder />, label: 'FTP' },
  { id: 'serial', icon: <VscPlug />, label: 'Serial' },
  { id: 's3', icon: <VscCloudUpload />, label: 'S3' },
];

const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  onConnect, onConnectTelnet, onConnectSerial, onConnectFtp,
  onLaunchRdp, onLaunchVnc, onConnectS3, onClose,
}) => {
  const [protocol, setProtocol] = useState<Protocol>('ssh');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('root');
  const [authType, setAuthType] = useState('password');
  const [password, setPassword] = useState('');
  const [identityFile, setIdentityFile] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [serialPort, setSerialPort] = useState('');
  const [baudRate, setBaudRate] = useState(9600);
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [s3Region, setS3Region] = useState('us-east-1');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Bucket, setS3Bucket] = useState('');
  const [saveSession, setSaveSession] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (protocol === 'serial') {
      invoke<string[]>('list_serial_ports').then(setSerialPorts).catch(() => {});
    }
  }, [protocol]);

  useEffect(() => {
    const info = PROTOCOL_INFO[protocol];
    if (info && info.defaultPort > 0) {
      setPort(info.defaultPort);
    }
  }, [protocol]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError('');

    try {
      const autoName = sessionName || (needsHost ? `${host}:${port}` : protocol === 'serial' ? serialPort : s3Bucket);

      switch (protocol) {
        case 'ssh':
          await onConnect({
            host, port, username, authType,
            password: authType === 'password' ? password : undefined,
            identityFile: authType === 'key' ? identityFile : undefined,
            name: sessionName || undefined,
          });
          break;
        case 'telnet':
          await onConnectTelnet(host, port, sessionName || undefined);
          onClose();
          break;
        case 'rdp':
          await onLaunchRdp(host, port !== 3389 ? port : undefined, username || undefined);
          onClose();
          break;
        case 'vnc':
          await onLaunchVnc(host, port !== 5900 ? port : undefined);
          onClose();
          break;
        case 'ftp':
          await onConnectFtp(host, port, sessionName || undefined);
          onClose();
          break;
        case 'serial':
          if (!serialPort) { setError('Select a serial port'); setConnecting(false); return; }
          await onConnectSerial(serialPort, baudRate, sessionName || undefined);
          onClose();
          break;
        case 's3':
          if (!s3Bucket.trim()) { setError('Enter a bucket name'); setConnecting(false); return; }
          await onConnectS3(
            s3Bucket, s3Region || undefined, s3AccessKey || undefined,
            s3SecretKey || undefined, s3Endpoint || undefined, sessionName || undefined,
          );
          onClose();
          break;
      }

      // Save session to local storage if checkbox is checked
      if (saveSession && autoName) {
        try {
          await invoke('save_session', {
            session: {
              name: autoName,
              session_type: protocol,
              host: needsHost ? host : undefined,
              port: needsHost ? port : undefined,
              username: needsUsername ? username : undefined,
              auth_type: needsAuth ? authType : undefined,
              identity_file: authType === 'key' ? identityFile : undefined,
              shell: undefined,
              group: undefined,
              baud_rate: protocol === 'serial' ? baudRate : undefined,
              serial_port: protocol === 'serial' ? serialPort : undefined,
            },
          });
        } catch { /* saving is optional */ }
      }
    } catch (err: any) {
      setError(String(err));
    }
    setConnecting(false);
  };

  const needsHost = ['ssh', 'telnet', 'rdp', 'vnc', 'ftp'].includes(protocol);
  const needsAuth = protocol === 'ssh';
  const needsUsername = ['ssh', 'rdp', 'ftp'].includes(protocol);
  const isS3 = protocol === 's3';

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscRemoteExplorer className="dialog__header-icon" />
          <h2 className="dialog__title">New Connection</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="dialog__body">
            {/* Protocol selector - MobXterm style tabs */}
            <div className="protocol-tabs">
              {PROTOCOLS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`protocol-tab ${protocol === p.id ? 'protocol-tab--active' : ''}`}
                  onClick={() => setProtocol(p.id)}
                  style={protocol === p.id ? { borderBottomColor: PROTOCOL_INFO[p.id].color } : {}}
                >
                  {p.icon}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            {/* Host / Port */}
            {needsHost && (
              <div className="dialog__section">
                <div className="dialog__section-title">Connection</div>
                <div className="dialog__field-row">
                  <div className="dialog__field dialog__field--grow">
                    <label className="dialog__label">Remote Host</label>
                    <input className="dialog__input" type="text"
                      placeholder="hostname or IP" value={host}
                      onChange={(e) => setHost(e.target.value)} autoFocus />
                  </div>
                  <div className="dialog__field dialog__field--small">
                    <label className="dialog__label">Port</label>
                    <input className="dialog__input" type="number" value={port}
                      onChange={(e) => setPort(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
            )}

            {/* Serial config */}
            {protocol === 'serial' && (
              <div className="dialog__section">
                <div className="dialog__section-title">Serial Port</div>
                <div className="dialog__field">
                  <label className="dialog__label">Port</label>
                  <select className="dialog__input" value={serialPort}
                    onChange={(e) => setSerialPort(e.target.value)}>
                    <option value="">Select port...</option>
                    {serialPorts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="dialog__field">
                  <label className="dialog__label">Baud Rate</label>
                  <select className="dialog__input" value={baudRate}
                    onChange={(e) => setBaudRate(parseInt(e.target.value))}>
                    {[9600, 19200, 38400, 57600, 115200].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Username */}
            {needsUsername && (
              <div className="dialog__section">
                <div className="dialog__section-title">Authentication</div>
                <div className="dialog__field">
                  <label className="dialog__label">Username</label>
                  <input className="dialog__input" type="text" value={username}
                    onChange={(e) => setUsername(e.target.value)} />
                </div>
                {needsAuth && (
                  <>
                    <div className="dialog__field">
                      <label className="dialog__label">Auth Method</label>
                      <select className="dialog__input" value={authType}
                        onChange={(e) => setAuthType(e.target.value)}>
                        <option value="password">Password</option>
                        <option value="key">Private Key</option>
                      </select>
                    </div>
                    {authType === 'password' ? (
                      <div className="dialog__field">
                        <label className="dialog__label">Password</label>
                        <input className="dialog__input" type="password"
                          placeholder="Enter password" value={password}
                          onChange={(e) => setPassword(e.target.value)} />
                      </div>
                    ) : (
                      <div className="dialog__field">
                        <label className="dialog__label">Private Key Path</label>
                        <div className="dialog__input-with-btn">
                          <input className="dialog__input" type="text"
                            placeholder="~/.ssh/id_rsa" value={identityFile}
                            onChange={(e) => setIdentityFile(e.target.value)} />
                          <button type="button" className="dialog__browse-btn"
                            onClick={async () => {
                              const selected = await openFileDialog({
                                title: 'Select Private Key',
                                defaultPath: identityFile || undefined,
                                filters: [
                                  { name: 'All Files', extensions: ['*'] },
                                  { name: 'PEM Files', extensions: ['pem', 'key'] },
                                ],
                              });
                              if (selected) setIdentityFile(selected);
                            }}>
                            Browse...
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* S3 config */}
            {isS3 && (
              <div className="dialog__section">
                <div className="dialog__section-title">S3 Configuration</div>
                <div className="dialog__field">
                  <label className="dialog__label">Bucket Name *</label>
                  <input className="dialog__input" type="text"
                    placeholder="my-bucket" value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)} autoFocus />
                </div>
                <div className="dialog__field">
                  <label className="dialog__label">Region</label>
                  <input className="dialog__input" type="text"
                    placeholder="us-east-1" value={s3Region}
                    onChange={(e) => setS3Region(e.target.value)} />
                </div>
                <div className="dialog__field-row">
                  <div className="dialog__field dialog__field--grow">
                    <label className="dialog__label">Access Key ID</label>
                    <input className="dialog__input" type="text"
                      placeholder="Optional (uses default credentials)" value={s3AccessKey}
                      onChange={(e) => setS3AccessKey(e.target.value)} />
                  </div>
                </div>
                <div className="dialog__field">
                  <label className="dialog__label">Secret Access Key</label>
                  <input className="dialog__input" type="password"
                    placeholder="Optional" value={s3SecretKey}
                    onChange={(e) => setS3SecretKey(e.target.value)} />
                </div>
                <div className="dialog__field">
                  <label className="dialog__label">Endpoint URL (MinIO / S3-compatible)</label>
                  <input className="dialog__input" type="text"
                    placeholder="https://minio.example.com" value={s3Endpoint}
                    onChange={(e) => setS3Endpoint(e.target.value)} />
                </div>
              </div>
            )}

            {/* Session name */}
            <div className="dialog__section">
              <div className="dialog__section-title">Session</div>
              <div className="dialog__field">
                <label className="dialog__label">Session Name (optional)</label>
                <input className="dialog__input" type="text"
                  placeholder="My Server" value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)} />
              </div>
              <div className="dialog__field">
                <label className="dialog__checkbox">
                  <input type="checkbox" checked={saveSession}
                    onChange={(e) => setSaveSession(e.target.checked)} />
                  Save this connection for later
                </label>
              </div>
            </div>

            {error && <div className="dialog__error">{error}</div>}
          </div>

          <div className="dialog__footer">
            <button type="button" className="dialog__btn dialog__btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="dialog__btn dialog__btn--primary"
              disabled={connecting || (needsHost && !host.trim()) || (isS3 && !s3Bucket.trim())}>
              {connecting ? 'Connecting...' : protocol === 'rdp' || protocol === 'vnc' ? 'Launch' : protocol === 's3' ? 'Browse' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConnectionDialog;
