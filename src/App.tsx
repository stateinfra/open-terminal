import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import TerminalPanel from './components/TerminalPanel';
import SessionManager from './components/SessionManager';
import SftpSidebar from './components/SftpSidebar';
import StatusBar from './components/StatusBar';
import ConnectionDialog from './components/ConnectionDialog';
import WelcomeTab from './components/WelcomeTab';
import S3Browser from './components/S3Browser';
import MultiExecBar from './components/MultiExecBar';
import SettingsDialog from './components/SettingsDialog';
import PortScanner from './components/PortScanner';
import WolDialog from './components/WolDialog';
import EnvironmentHub from './components/EnvironmentHub';
import SnippetManager from './components/SnippetManager';
import QuickConnect from './components/QuickConnect';
import TunnelManager from './components/TunnelManager';
import NetworkTools from './components/NetworkTools';
import SshKeyManager from './components/SshKeyManager';
import SessionImportExport from './components/SessionImportExport';
import PasswordManager from './components/PasswordManager';
import MacroManager from './components/MacroManager';
import CommandPalette from './components/CommandPalette';
import ClipboardHistory from './components/ClipboardHistory';
import EnvVarManager from './components/EnvVarManager';
import TemplateManager from './components/TemplateManager';
// RemoteMonitor is now integrated into StatusBar
import LocalServerManager from './components/LocalServerManager';
import NetworkCapture from './components/NetworkCapture';
import RemoteFileEditor from './components/RemoteFileEditor';
import { THEMES } from './components/SettingsDialog';
import {
  VscTerminal, VscRemoteExplorer, VscSettingsGear, VscSearch,
  VscRadioTower, VscBroadcast, VscPackage, VscCode, VscLock,
  VscKey, VscCloudDownload, VscRecord, VscClippy,
  VscPulse, VscGlobe, VscSymbolVariable,
} from 'react-icons/vsc';
import { useTerminalSessions } from './hooks/useTerminalSessions';
import { SavedSession } from './types';

const App: React.FC = () => {
  const {
    tabs, activeTabId, terminalSize,
    broadcastMode, broadcastTargets,
    selectTab, createLocalTab, createSshTab,
    createTelnetTab, createSerialTab, createFtpTab,
    createS3Tab, createDockerTab, createWslTab,
    launchRdp, launchVnc,
    closeTab, updateTerminalSize,
    reorderTabs, setTabColor,
    setBroadcastMode, setBroadcastTargets, broadcastWrite,
  } = useTerminalSessions();

  const [isHomeActive, setIsHomeActive] = useState(true);
  const [sessionManagerOpen, setSessionManagerOpen] = useState(true);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showMultiExec, setShowMultiExec] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPortScanner, setShowPortScanner] = useState(false);
  const [showWol, setShowWol] = useState(false);
  const [showEnvHub, setShowEnvHub] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showQuickConnect, setShowQuickConnect] = useState(false);
  const [showTunnels, setShowTunnels] = useState(false);
  const [showNetTools, setShowNetTools] = useState(false);
  const [showSshKeys, setShowSshKeys] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showPasswordMgr, setShowPasswordMgr] = useState(false);
  const [showMacroMgr, setShowMacroMgr] = useState(false);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [showClipboard, setShowClipboard] = useState(false);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showLocalServer, setShowLocalServer] = useState(false);
  const [showNetCapture, setShowNetCapture] = useState(false);
  const [editingFile, setEditingFile] = useState<{ sftpId: string; path: string } | null>(null);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('ot-theme') || 'catppuccin-mocha';
  });
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null);
  const [splitDirection, setSplitDirection] = useState<'horizontal' | 'vertical'>('horizontal');
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const [termSettings, setTermSettings] = useState<{
    fontSize: number;
    fontFamily: string;
    cursorBlink: boolean;
    cursorStyle: 'block' | 'underline' | 'bar';
    scrollback: number;
  }>(() => {
    const saved = localStorage.getItem('ot-settings');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return {
      fontSize: 15,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
    };
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem('ot-theme', currentTheme);
  }, [currentTheme]);
  useEffect(() => {
    localStorage.setItem('ot-settings', JSON.stringify(termSettings));
  }, [termSettings]);

  // Apply theme to CSS variables
  useEffect(() => {
    const theme = THEMES[currentTheme];
    if (!theme) return;
    const root = document.documentElement;
    // Base colors
    root.style.setProperty('--base', theme.uiBase);
    root.style.setProperty('--mantle', theme.uiMantle);
    root.style.setProperty('--crust', theme.uiCrust);
    root.style.setProperty('--surface0', theme.uiSurface0);
    root.style.setProperty('--surface1', theme.selectionBackground);
    root.style.setProperty('--surface2', theme.black);
    root.style.setProperty('--text', theme.uiText);
    // Accent colors
    root.style.setProperty('--blue', theme.blue);
    root.style.setProperty('--green', theme.green);
    root.style.setProperty('--red', theme.red);
    root.style.setProperty('--yellow', theme.yellow);
    root.style.setProperty('--mauve', theme.magenta);
    root.style.setProperty('--teal', theme.cyan);
    root.style.setProperty('--peach', theme.yellow);
    root.style.setProperty('--lavender', theme.blue);
    // Derived UI colors
    root.style.setProperty('--subtext0', theme.brightBlack);
    root.style.setProperty('--subtext1', theme.white);
    root.style.setProperty('--overlay0', theme.brightBlack);
    root.style.setProperty('--overlay1', theme.white);
    // Statusbar colors
    root.style.setProperty('--statusbar-bg', theme.blue);
    root.style.setProperty('--statusbar-fg', theme.uiCrust);
    root.style.setProperty('--statusbar-monitor-bg', theme.uiCrust);
    root.style.setProperty('--statusbar-monitor-fg', theme.brightBlack);
  }, [currentTheme]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const showSftp = activeTab?.type === 'ssh' && !!activeTab.sftpId;

  const [globalError, setGlobalError] = useState('');

  const handleNewTab = useCallback(
    (type: 'local' | 'ssh') => {
      if (type === 'local') {
        createLocalTab().catch((err) => {
          setGlobalError(`Failed to create local terminal: ${err}`);
          setTimeout(() => setGlobalError(''), 5000);
        });
      } else {
        setShowConnectionDialog(true);
      }
    },
    [createLocalTab]
  );

  const handleSshConnect = useCallback(
    async (params: {
      host: string; port: number; username: string; authType: string;
      password?: string; identityFile?: string; name?: string;
    }) => {
      await createSshTab({
        host: params.host, port: params.port, username: params.username,
        password: params.password, keyPath: params.identityFile, name: params.name,
      });
      setShowConnectionDialog(false);
      setSessionRefreshKey((k) => k + 1);
    },
    [createSshTab]
  );

  const handleConnectSession = useCallback(
    (session: SavedSession) => {
      if (session.session_type === 'local') {
        createLocalTab(session.name);
      } else if (session.session_type === 'ssh' && session.host && session.username) {
        createSshTab({
          host: session.host, port: session.port || 22,
          username: session.username, keyPath: session.identity_file, name: session.name,
          color: session.color,
        });
      } else if (session.session_type === 'telnet' && session.host) {
        createTelnetTab(session.host, session.port || 23, session.name);
      } else if (session.session_type === 'serial' && session.serial_port) {
        createSerialTab(session.serial_port, session.baud_rate || 9600, session.name);
      }
    },
    [createLocalTab, createSshTab, createTelnetTab, createSerialTab]
  );

  // Command Palette actions
  const paletteActions = useMemo(() => [
    { id: 'local', label: 'Open Local Terminal', icon: <VscTerminal />, action: () => createLocalTab().catch(() => {}) },
    { id: 'ssh', label: 'New Connection (SSH/Telnet/FTP...)', icon: <VscRemoteExplorer />, action: () => setShowConnectionDialog(true) },
    { id: 'quick', label: 'Quick Connect', icon: <VscSearch />, shortcut: 'Ctrl+K', action: () => setShowQuickConnect(true) },
    { id: 'settings', label: 'Settings', icon: <VscSettingsGear />, shortcut: 'Ctrl+,', action: () => setShowSettings(true) },
    { id: 'multiexec', label: 'Multi-Exec', icon: <VscBroadcast />, shortcut: 'Ctrl+Shift+M', action: () => setShowMultiExec(true) },
    { id: 'broadcast', label: `Broadcast Mode ${broadcastMode ? 'Off' : 'On'}`, icon: <VscBroadcast />, action: () => {
      setBroadcastMode(b => !b);
      if (!broadcastMode) setBroadcastTargets(new Set(tabs.map(t => t.id)));
    }},
    { id: 'snippets', label: 'Script Snippets', icon: <VscCode />, shortcut: 'Ctrl+Shift+S', action: () => setShowSnippets(true) },
    { id: 'envhub', label: 'Docker / WSL', icon: <VscPackage />, action: () => setShowEnvHub(true) },
    { id: 'scanner', label: 'Port Scanner', icon: <VscSearch />, action: () => setShowPortScanner(true) },
    { id: 'wol', label: 'Wake-on-LAN', icon: <VscRadioTower />, action: () => setShowWol(true) },
    { id: 'tunnels', label: 'SSH Tunnels', icon: <VscLock />, action: () => setShowTunnels(true) },
    { id: 'nettools', label: 'Network Tools (Ping/Traceroute/DNS)', icon: <VscRadioTower />, action: () => setShowNetTools(true) },
    { id: 'sshkeys', label: 'SSH Key Manager', icon: <VscKey />, action: () => setShowSshKeys(true) },
    { id: 'importexport', label: 'Import / Export Sessions', icon: <VscCloudDownload />, action: () => setShowImportExport(true) },
    { id: 'password', label: 'Password Manager', icon: <VscLock />, action: () => setShowPasswordMgr(true) },
    { id: 'macro', label: 'Macro Recording', icon: <VscRecord />, action: () => setShowMacroMgr(true) },
    { id: 'clipboard', label: 'Clipboard History', icon: <VscClippy />, shortcut: 'Ctrl+Shift+V', action: () => setShowClipboard(true) },
    { id: 'envvars', label: 'Environment Variables', icon: <VscTerminal />, action: () => setShowEnvVars(true) },
    { id: 'templates', label: 'Connection Templates', icon: <VscRemoteExplorer />, action: () => setShowTemplates(true) },
    { id: 'monitor', label: 'Remote System Monitor', icon: <VscPulse />, action: () => {} },
    { id: 'localserver', label: 'Local HTTP Server', icon: <VscGlobe />, action: () => setShowLocalServer(true) },
    { id: 'netcapture', label: 'Network Connections', icon: <VscSymbolVariable />, action: () => setShowNetCapture(true) },
    { id: 'split-h', label: 'Split Terminal (Horizontal)', icon: <VscTerminal />, shortcut: 'Ctrl+\\', action: () => {
      if (activeTab) {
        setSplitDirection('horizontal');
        createLocalTab().then(tab => { if (tab) setSplitSessionId(tab.sessionId); }).catch(() => {});
      }
    }},
    { id: 'split-v', label: 'Split Terminal (Vertical)', icon: <VscTerminal />, shortcut: 'Ctrl+Shift+\\', action: () => {
      if (activeTab) {
        setSplitDirection('vertical');
        createLocalTab().then(tab => { if (tab) setSplitSessionId(tab.sessionId); }).catch(() => {});
      }
    }},
  ], [tabs, activeTab, broadcastMode, createLocalTab, setBroadcastMode, setBroadcastTargets]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setShowMultiExec(prev => !prev);
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setShowSettings(prev => !prev);
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setShowQuickConnect(prev => !prev);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setShowSnippets(prev => !prev);
      }
      // Ctrl+P = Command Palette
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        setShowCmdPalette(prev => !prev);
      }
      // Ctrl+Shift+V = Clipboard History
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        setShowClipboard(prev => !prev);
      }
      // Ctrl+\ = split horizontal, Ctrl+Shift+\ = split vertical
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        if (splitSessionId) {
          setSplitSessionId(null);
        } else if (activeTab) {
          setSplitDirection(e.shiftKey ? 'vertical' : 'horizontal');
          createLocalTab().then(tab => {
            if (tab) setSplitSessionId(tab.sessionId);
          }).catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-layout">
      <TitleBar />
      <div className="app-body">
        <SessionManager
          open={sessionManagerOpen}
          refreshKey={sessionRefreshKey}
          onToggle={() => setSessionManagerOpen((p) => !p)}
          onNewLocal={() => createLocalTab().catch((err) => {
            setGlobalError(`Failed to create local terminal: ${err}`);
            setTimeout(() => setGlobalError(''), 5000);
          })}
          onNewSsh={() => setShowConnectionDialog(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenPortScanner={() => setShowPortScanner(true)}
          onOpenTunnels={() => setShowTunnels(true)}
          onOpenSshKeys={() => setShowSshKeys(true)}
          onOpenImportExport={() => setShowImportExport(true)}
          onOpenPasswordMgr={() => setShowPasswordMgr(true)}
          onOpenEnvVars={() => setShowEnvVars(true)}
          onOpenTemplates={() => setShowTemplates(true)}
        />
        <div className="main-area">
          {showQuickConnect && (
            <QuickConnect
              onConnect={(host, port, username) => {
                createSshTab({ host, port, username });
              }}
              onClose={() => setShowQuickConnect(false)}
            />
          )}
          {broadcastMode && (
            <div className="broadcast-bar">
              <VscBroadcast />
              <span>Broadcast Mode — Input is sent to all selected tabs</span>
              <div className="broadcast-bar__targets">
                {tabs.map(t => (
                  <label key={t.id} className="broadcast-bar__target">
                    <input
                      type="checkbox"
                      checked={broadcastTargets.has(t.id)}
                      onChange={(e) => {
                        setBroadcastTargets(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(t.id); else next.delete(t.id);
                          return next;
                        });
                      }}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <button className="broadcast-bar__close" onClick={() => setBroadcastMode(false)}>&#x2715;</button>
            </div>
          )}
          <TabBar
            tabs={tabs} activeTabId={activeTabId}
            isHomeActive={isHomeActive}
            onSelectTab={(id) => { setIsHomeActive(false); selectTab(id); }}
            onSelectHome={() => setIsHomeActive(true)}
            onCloseTab={closeTab}
            onReorderTabs={reorderTabs}
            onSetTabColor={setTabColor}
          />
          {showMultiExec && (
            <MultiExecBar tabs={tabs} onClose={() => setShowMultiExec(false)} />
          )}
          <div className="content-area">
            {/* Home tab (WelcomeTab) */}
            <div className={`terminal-wrapper ${isHomeActive ? '' : 'terminal-wrapper--hidden'}`}>
              <WelcomeTab
                onNewLocal={() => { createLocalTab().then(() => setIsHomeActive(false)).catch((err) => {
                  setGlobalError(`Failed to create local terminal: ${err}`);
                  setTimeout(() => setGlobalError(''), 5000);
                }); }}
                onConnectSession={(session) => { handleConnectSession(session); setIsHomeActive(false); }}
                onOpenShell={(shell) => {
                  if (shell === 'docker') {
                    setShowEnvHub(true);
                  } else if (shell.startsWith('wsl:')) {
                    createWslTab(shell.replace('wsl:', '')).then(() => setIsHomeActive(false)).catch(() => {});
                  } else {
                    createLocalTab(shell).then(() => setIsHomeActive(false)).catch((err) => {
                      setGlobalError(`Failed to open shell: ${err}`);
                      setTimeout(() => setGlobalError(''), 5000);
                    });
                  }
                }}
              />
            </div>
            {/* Session tabs (always mounted, hidden when home is active) */}
            {!isHomeActive && showSftp && activeTab?.sftpId && (
              <SftpSidebar sftpId={activeTab.sftpId} sessionId={activeTab.sessionId} onEditFile={(sid, path) => setEditingFile({ sftpId: sid, path })} />
            )}
            <div className={`terminal-wrapper ${isHomeActive ? 'terminal-wrapper--hidden' : ''}`} style={
              splitSessionId ? { flexDirection: splitDirection === 'horizontal' ? 'row' as const : 'column' as const } : undefined
            }>
              {activeTab?.type === 's3' && (
                <S3Browser sessionId={activeTab.sessionId} />
              )}
              {tabs.filter(tab => tab.type !== 's3').map((tab) => (
                <TerminalPanel
                  key={tab.id} sessionId={tab.sessionId}
                  isActive={!isHomeActive && tab.id === activeTabId}
                  onResize={tab.id === activeTabId ? updateTerminalSize : undefined}
                  settings={termSettings}
                  themeId={currentTheme}
                  broadcastMode={broadcastMode && broadcastTargets.has(tab.id)}
                  onBroadcastWrite={broadcastMode ? broadcastWrite : undefined}
                />
              ))}
              {splitSessionId && (
                <div style={{ flex: 1, borderLeft: splitDirection === 'horizontal' ? '2px solid var(--surface1)' : undefined, borderTop: splitDirection === 'vertical' ? '2px solid var(--surface1)' : undefined, position: 'relative', overflow: 'hidden' }}>
                  <TerminalPanel
                    sessionId={splitSessionId}
                    isActive={true}
                    settings={termSettings}
                  />
                  <button
                    onClick={() => { invoke('close_session', { sessionId: splitSessionId }).catch(() => {}); setSplitSessionId(null); }}
                    style={{
                      position: 'absolute', top: 4, right: 4, zIndex: 5,
                      background: 'var(--surface0)', border: '1px solid var(--surface1)',
                      color: 'var(--subtext0)', borderRadius: 'var(--r-sm)',
                      cursor: 'pointer', padding: '2px 6px', fontSize: 'var(--fs-xs)',
                    }}
                    title="Close split"
                  >
                    &#x2715;
                  </button>
                </div>
              )}
              {/* Remote monitor is now in the statusbar */}
            </div>
          </div>
        </div>
      </div>
      {globalError && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--red)', color: 'var(--crust)', padding: '0.6rem 1.2rem',
          borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500, zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {globalError}
        </div>
      )}
      <StatusBar activeTab={activeTab} terminalSize={terminalSize} isHomeActive={isHomeActive} />

      {showConnectionDialog && (
        <ConnectionDialog
          onConnect={handleSshConnect}
          onConnectTelnet={async (h, p, n) => { await createTelnetTab(h, p, n); setShowConnectionDialog(false); setSessionRefreshKey((k) => k + 1); }}
          onConnectSerial={async (p, b, n) => { await createSerialTab(p, b, n); setShowConnectionDialog(false); setSessionRefreshKey((k) => k + 1); }}
          onConnectFtp={async (h, p, n) => { await createFtpTab(h, p, n); setShowConnectionDialog(false); setSessionRefreshKey((k) => k + 1); }}
          onLaunchRdp={async (h, p, u) => { await launchRdp(h, p, u); setShowConnectionDialog(false); }}
          onLaunchVnc={async (h, p) => { await launchVnc(h, p); setShowConnectionDialog(false); }}
          onConnectS3={async (bucket, region, accessKey, secretKey, endpoint, name) => {
            await createS3Tab(bucket, region, accessKey, secretKey, endpoint, name);
            setShowConnectionDialog(false);
            setSessionRefreshKey((k) => k + 1);
          }}
          onClose={() => setShowConnectionDialog(false)}
        />
      )}

      {showSettings && (
        <SettingsDialog
          settings={termSettings}
          onSave={setTermSettings}
          onClose={() => setShowSettings(false)}
          currentTheme={currentTheme}
          onThemeChange={setCurrentTheme}
        />
      )}

      {showPortScanner && <PortScanner onClose={() => setShowPortScanner(false)} />}
      {showWol && <WolDialog onClose={() => setShowWol(false)} />}

      {showEnvHub && (
        <EnvironmentHub
          onConnectDocker={(id, name, shell) => createDockerTab(id, name, shell)}
          onConnectWsl={(distro) => createWslTab(distro)}
          onClose={() => setShowEnvHub(false)}
        />
      )}

      {showSnippets && (
        <SnippetManager
          onClose={() => setShowSnippets(false)}
          onRunSnippet={activeTab ? (cmd) => {
            invoke('write_session', { sessionId: activeTab.sessionId, data: cmd + '\r' }).catch(() => {});
          } : undefined}
        />
      )}

      {showTunnels && <TunnelManager onClose={() => setShowTunnels(false)} />}
      {showNetTools && <NetworkTools onClose={() => setShowNetTools(false)} />}
      {showSshKeys && <SshKeyManager onClose={() => setShowSshKeys(false)} />}
      {showImportExport && (
        <SessionImportExport
          onClose={() => setShowImportExport(false)}
          onImported={() => setSessionRefreshKey((k) => k + 1)}
        />
      )}
      {showPasswordMgr && <PasswordManager onClose={() => setShowPasswordMgr(false)} />}
      {showMacroMgr && (
        <MacroManager
          onClose={() => setShowMacroMgr(false)}
          activeSessionId={activeTab?.sessionId}
          onPlayMacro={activeTab ? (keystrokes) => {
            const play = async () => {
              for (const ks of keystrokes) {
                if (ks.delay_ms > 0) await new Promise(r => setTimeout(r, ks.delay_ms));
                await invoke('write_session', { sessionId: activeTab.sessionId, data: ks.data }).catch(() => {});
              }
            };
            play();
          } : undefined}
        />
      )}
      {showEnvVars && (
        <EnvVarManager
          onClose={() => setShowEnvVars(false)}
          onApply={activeTab ? (vars) => {
            const cmd = Object.entries(vars).map(([k, v]) => `export ${k}="${v}"`).join(' && ');
            invoke('write_session', { sessionId: activeTab.sessionId, data: cmd + '\r' }).catch(() => {});
          } : undefined}
        />
      )}
      {showTemplates && (
        <TemplateManager
          onClose={() => setShowTemplates(false)}
          onUseTemplate={(params) => {
            createSshTab({ host: params.host, port: params.port, username: params.username, name: params.name });
          }}
        />
      )}
      {showCmdPalette && (
        <CommandPalette actions={paletteActions} onClose={() => setShowCmdPalette(false)} />
      )}
      {showClipboard && (
        <ClipboardHistory
          onClose={() => setShowClipboard(false)}
          onPaste={activeTab ? (text) => {
            invoke('write_session', { sessionId: activeTab.sessionId, data: text }).catch(() => {});
            setShowClipboard(false);
          } : undefined}
        />
      )}
      {showLocalServer && <LocalServerManager onClose={() => setShowLocalServer(false)} />}
      {showNetCapture && <NetworkCapture onClose={() => setShowNetCapture(false)} />}
      {editingFile && (
        <RemoteFileEditor
          sftpId={editingFile.sftpId} filePath={editingFile.path}
          onClose={() => setEditingFile(null)} onSaved={() => {}}
        />
      )}
    </div>
  );
};

export default App;
