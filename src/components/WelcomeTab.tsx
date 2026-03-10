import React, { useState, useEffect, useCallback } from 'react';
import {
  VscTerminal, VscRemoteExplorer, VscCircleFilled,
  VscPackage, VscVm, VscPlug, VscFolder, VscCloudUpload,
  VscDesktopDownload, VscScreenFull,
  VscChevronDown, VscChevronRight,
} from 'react-icons/vsc';
import {
  FaWindows, FaLinux, FaApple, FaFreebsd, FaDocker,
} from 'react-icons/fa';
import {
  SiUbuntu, SiDebian, SiCentos, SiRedhat, SiFedora,
  SiSuse, SiArchlinux, SiAlpinelinux,
} from 'react-icons/si';
import { FaAmazon } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { SavedSession, HealthResult, SystemInfo, RemoteOsInfo } from '../types';

interface WelcomeTabProps {
  onNewLocal: () => void;
  onConnectSession?: (session: SavedSession) => void;
  onOpenShell?: (shell: string) => void;
  refreshKey?: number;
}

const SESSION_ICONS: Record<string, React.ReactNode> = {
  ssh: <VscRemoteExplorer />,
  local: <VscTerminal />,
  telnet: <VscTerminal />,
  serial: <VscPlug />,
  ftp: <VscFolder />,
  s3: <VscCloudUpload />,
  docker: <VscPackage />,
  wsl: <VscVm />,
  rdp: <VscDesktopDownload />,
  vnc: <VscScreenFull />,
};

// Returns actual brand SVG icon for OS
function getOsIcon(osName: string): React.ReactNode {
  const lower = osName.toLowerCase();
  if (lower.includes('ubuntu')) return <SiUbuntu />;
  if (lower.includes('debian')) return <SiDebian />;
  if (lower.includes('centos')) return <SiCentos />;
  if (lower.includes('red hat') || lower.includes('rhel')) return <SiRedhat />;
  if (lower.includes('fedora')) return <SiFedora />;
  if (lower.includes('suse') || lower.includes('sles')) return <SiSuse />;
  if (lower.includes('arch')) return <SiArchlinux />;
  if (lower.includes('alpine')) return <SiAlpinelinux />;
  if (lower.includes('amazon')) return <FaAmazon />;
  if (lower.includes('freebsd') || lower.includes('openbsd')) return <FaFreebsd />;
  if (lower.includes('docker')) return <FaDocker />;
  if (lower.includes('windows')) return <FaWindows />;
  if (lower.includes('macos') || lower.includes('darwin')) return <FaApple />;
  if (lower.includes('linux')) return <FaLinux />;
  return <FaLinux />;
}

// Color for the OS icon
function getOsIconColor(osName: string): string {
  const lower = osName.toLowerCase();
  if (lower.includes('ubuntu')) return '#E95420';
  if (lower.includes('debian')) return '#A81D33';
  if (lower.includes('centos')) return '#262577';
  if (lower.includes('red hat') || lower.includes('rhel')) return '#EE0000';
  if (lower.includes('fedora')) return '#51A2DA';
  if (lower.includes('suse') || lower.includes('sles')) return '#73BA25';
  if (lower.includes('arch')) return '#1793D1';
  if (lower.includes('alpine')) return '#0D597F';
  if (lower.includes('amazon')) return '#FF9900';
  if (lower.includes('freebsd') || lower.includes('openbsd')) return '#AB2B28';
  if (lower.includes('docker')) return '#2496ED';
  if (lower.includes('windows')) return '#0078D6';
  if (lower.includes('macos') || lower.includes('darwin')) return '#A2AAAD';
  return '#FCC624'; // Linux tux yellow
}

function guessRemoteShells(os: string): string[] {
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return ['PowerShell', 'CMD'];
  if (lower.includes('alpine')) return ['ash', 'sh'];
  if (lower.includes('linux') || lower.includes('bsd') || lower.includes('ubuntu') || lower.includes('debian') || lower.includes('centos') || lower.includes('fedora') || lower.includes('arch') || lower.includes('amazon') || lower.includes('red hat') || lower.includes('suse')) {
    return ['bash', 'sh', 'zsh', 'fish'];
  }
  return ['sh'];
}

const WelcomeTab: React.FC<WelcomeTabProps> = ({ onNewLocal, onConnectSession, onOpenShell, refreshKey }) => {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [healthCache, setHealthCache] = useState<Record<string, HealthResult>>({});
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [remoteOsCache, setRemoteOsCache] = useState<Record<string, RemoteOsInfo>>({});

  const loadSessions = useCallback(async () => {
    try {
      const loaded = await invoke<SavedSession[]>('load_sessions');
      setSessions(loaded);
    } catch { /* ignore */ }
  }, []);

  const loadSystemInfo = useCallback(async () => {
    try {
      const info = await invoke<SystemInfo>('get_system_info');
      setSysInfo(info);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSessions();
    loadSystemInfo();
  }, [loadSessions, loadSystemInfo, refreshKey]);

  useEffect(() => {
    const sshList = sessions.filter((s) => s.session_type === 'ssh' && s.host);
    if (sshList.length === 0) return;
    const checkAll = async () => {
      for (const s of sshList) {
        if (!s.host) continue;
        try {
          const result = await invoke<HealthResult>('check_host_health', { host: s.host, port: s.port || 22 });
          setHealthCache((prev) => ({ ...prev, [s.name]: result }));
          if (result.reachable && s.identity_file && s.username) {
            invoke<RemoteOsInfo>('detect_remote_os', {
              host: s.host,
              port: s.port || 22,
              username: s.username,
              password: null,
              keyPath: s.identity_file,
            }).then((info) => {
              setRemoteOsCache((prev) => ({ ...prev, [s.name]: info }));
            }).catch(() => {});
          }
        } catch { /* ignore */ }
      }
    };
    checkAll();
  }, [sessions]);

  const toggleExpand = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sshSessions = sessions.filter((s) => s.session_type === 'ssh');
  const otherSessions = sessions.filter((s) => s.session_type !== 'ssh');

  // Determine OS display text and icon for a session
  const getSessionOsInfo = (sessionName: string, osGuess?: string | null) => {
    const remote = remoteOsCache[sessionName];
    const h = healthCache[sessionName];
    const osText = remote
      ? `${remote.pretty_name} (${remote.arch})`
      : (osGuess || h?.os_guess || null);
    const osSource = remote?.pretty_name || osGuess || h?.os_guess || '';
    return { osText, osSource };
  };

  return (
    <div className="hub">
      {/* Connections list */}
      <div className="hub__content">
        {/* Local machine */}
        {sysInfo && (
          <div className="hub__group">
            <div className="hub__group-header">
              <VscTerminal className="hub__group-icon hub__group-icon--local" />
              <span>Local</span>
              <span className="hub__group-count">{sysInfo.shells.length}</span>
            </div>
            <div className="hub__list">
              <div className="hub__row-wrapper">
                <button
                  className="hub__row"
                  onClick={() => toggleExpand('local')}
                  onDoubleClick={onNewLocal}
                >
                  <span className="hub__row-expand">
                    {expandedItems.has('local') ? <VscChevronDown /> : <VscChevronRight />}
                  </span>
                  <VscCircleFilled className="hub__row-status hub__row-status--ok" />
                  <span className="hub__row-icon">{SESSION_ICONS.local}</span>
                  <span className="hub__row-name">{sysInfo.hostname}</span>
                  <span className="hub__row-os">
                    <span className="hub__row-os-logo" style={{ color: getOsIconColor(sysInfo.os_name) }}>
                      {getOsIcon(sysInfo.os_name)}
                    </span>
                    {sysInfo.os_name} {sysInfo.os_version} ({sysInfo.arch})
                  </span>
                </button>
                {expandedItems.has('local') && (
                  <div className="hub__row-shells">
                    {sysInfo.shells.map((shell) => (
                      <button
                        key={shell.path}
                        className="hub__shell-item"
                        onClick={() => {
                          if (shell.kind === 'wsl') {
                            const distro = shell.path.replace('wsl -d ', '');
                            onOpenShell?.(`wsl:${distro}`);
                          } else if (shell.kind === 'docker') {
                            onOpenShell?.('docker');
                          } else {
                            onOpenShell?.(shell.path);
                          }
                        }}
                      >
                        <VscTerminal className="hub__shell-item-icon" />
                        <span className="hub__shell-item-name">{shell.name}</span>
                        <span className="hub__shell-item-path">{shell.path}</span>
                        <span className="hub__shell-item-kind">{shell.kind.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SSH Connections */}
        {sshSessions.length > 0 && (
          <div className="hub__group">
            <div className="hub__group-header">
              <VscRemoteExplorer className="hub__group-icon hub__group-icon--ssh" />
              <span>SSH Connections</span>
              <span className="hub__group-count">{sshSessions.length}</span>
            </div>
            <div className="hub__list">
              {sshSessions.map((session) => {
                const h = healthCache[session.name];
                const { osText, osSource } = getSessionOsInfo(session.name);
                const itemKey = `ssh:${session.name}`;
                const isExpanded = expandedItems.has(itemKey);
                const remote = remoteOsCache[session.name];
                const shellList = remote && remote.shells.length > 0
                  ? remote.shells.map((s) => {
                      const parts = s.split('/');
                      return { name: parts[parts.length - 1], path: s };
                    })
                  : (h?.os_guess ? guessRemoteShells(h.os_guess).map((s) => ({ name: s, path: s })) : []);

                return (
                  <div key={session.name} className="hub__row-wrapper">
                    <button
                      className="hub__row"
                      onClick={() => toggleExpand(itemKey)}
                      onDoubleClick={() => onConnectSession?.(session)}
                    >
                      <span className="hub__row-expand">
                        {isExpanded ? <VscChevronDown /> : <VscChevronRight />}
                      </span>
                      <VscCircleFilled
                        className={`hub__row-status ${h ? (h.reachable ? 'hub__row-status--ok' : 'hub__row-status--fail') : 'hub__row-status--unknown'}`}
                      />
                      <span className="hub__row-icon">{SESSION_ICONS.ssh}</span>
                      <span className="hub__row-name">{session.name}</span>
                      {osText && (
                        <span className="hub__row-os">
                          <span className="hub__row-os-logo" style={{ color: getOsIconColor(osSource) }}>
                            {getOsIcon(osSource)}
                          </span>
                          {osText}
                        </span>
                      )}
                      <span className="hub__row-host">
                        {session.username}@{session.host}:{session.port || 22}
                      </span>
                      {h?.reachable && h.latency_ms != null && (
                        <span className="hub__row-latency">{h.latency_ms}ms</span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="hub__row-shells">
                        {!h?.reachable && (
                          <div className="hub__shell-offline">Host is offline — shell detection unavailable</div>
                        )}
                        {h?.reachable && shellList.length > 0 && shellList.map((shell) => (
                          <button
                            key={shell.path}
                            className="hub__shell-item"
                            onClick={() => onConnectSession?.(session)}
                          >
                            <VscTerminal className="hub__shell-item-icon" />
                            <span className="hub__shell-item-name">{shell.name}</span>
                            <span className="hub__shell-item-path">{shell.path}</span>
                            <span className="hub__shell-item-kind">SSH</span>
                          </button>
                        ))}
                        {h?.reachable && shellList.length === 0 && (
                          <button
                            className="hub__shell-item"
                            onClick={() => onConnectSession?.(session)}
                          >
                            <VscTerminal className="hub__shell-item-icon" />
                            <span className="hub__shell-item-name">Default Shell</span>
                            <span className="hub__shell-item-path">{session.username}@{session.host}</span>
                            <span className="hub__shell-item-kind">SSH</span>
                          </button>
                        )}
                        {!h && (
                          <div className="hub__shell-offline">Checking host status...</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Other Connections */}
        {otherSessions.length > 0 && (
          <div className="hub__group">
            <div className="hub__group-header">
              <VscFolder className="hub__group-icon" />
              <span>Other Connections</span>
              <span className="hub__group-count">{otherSessions.length}</span>
            </div>
            <div className="hub__list">
              {otherSessions.map((session) => (
                <button
                  key={session.name}
                  className="hub__row"
                  onClick={() => onConnectSession?.(session)}
                >
                  <span className="hub__row-icon">{SESSION_ICONS[session.session_type] || <VscTerminal />}</span>
                  <span className="hub__row-name">{session.name}</span>
                  <span className="hub__row-os">
                    <VscPlug className="hub__row-os-logo" />
                    {session.session_type.toUpperCase()}
                  </span>
                  <span className="hub__row-host">
                    {session.host ? `${session.host}${session.port ? `:${session.port}` : ''}` : session.serial_port || ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {sessions.length === 0 && !sysInfo && (
          <div className="hub__empty">
            <VscRemoteExplorer className="hub__empty-icon" />
            <div className="hub__empty-title">No saved connections</div>
            <div className="hub__empty-desc">Add a new connection from the sidebar</div>
          </div>
        )}
      </div>

      {/* Footer badges */}
      <div className="hub__footer">
        {['SSH', 'SFTP', 'RDP', 'VNC', 'FTP', 'Serial', 'Telnet', 'S3', 'Docker', 'WSL'].map((p) => (
          <span key={p} className="hub__badge">{p}</span>
        ))}
      </div>
    </div>
  );
};

export default WelcomeTab;
