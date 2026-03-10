import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Tab, SessionType } from '../types';

let nextId = 1;
function generateId(): string {
  return `tab-${Date.now()}-${nextId++}`;
}

export function useTerminalSessions() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [terminalSize, setTerminalSize] = useState({ cols: 120, rows: 30 });
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set());

  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const addTab = useCallback((tab: Tab) => {
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const reorderTabs = useCallback((newTabs: Tab[]) => {
    setTabs(newTabs);
  }, []);

  const setTabColor = useCallback((tabId: string, color: string | undefined) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, color } : t));
  }, []);

  const createLocalTab = useCallback(async (shell?: string) => {
    try {
      const sessionId = await invoke<string>('create_local_session', { shell: shell || null });
      const tabName = shell
        ? shell.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') || 'Local Shell'
        : 'Local Shell';
      const tab: Tab = {
        id: generateId(),
        name: tabName,
        type: 'local',
        sessionId,
      };
      addTab(tab);
      return tab;
    } catch (err) {
      console.error('Failed to create local session:', err);
      throw err;
    }
  }, [addTab]);

  const createSshTab = useCallback(async (params: {
    host: string;
    port: number;
    username: string;
    password?: string;
    keyPath?: string;
    name?: string;
    color?: string;
  }) => {
    const sessionId = await invoke<string>('create_ssh_session', {
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
      keyPath: params.keyPath,
    });

    let sftpId: string | undefined;
    try {
      sftpId = await invoke<string>('sftp_connect', {
        host: params.host,
        port: params.port,
        username: params.username,
        password: params.password,
        keyPath: params.keyPath,
      });
    } catch { /* SFTP optional */ }

    const tab: Tab = {
      id: generateId(),
      name: params.name || `${params.username}@${params.host}`,
      type: 'ssh',
      sessionId,
      sftpId,
      color: params.color,
      sshInfo: {
        host: params.host,
        port: params.port,
        username: params.username,
        keyPath: params.keyPath,
      },
    };
    addTab(tab);
    return tab;
  }, [addTab]);

  const createTelnetTab = useCallback(async (host: string, port: number, name?: string) => {
    const sessionId = await invoke<string>('create_telnet_session', { host, port });
    const tab: Tab = {
      id: generateId(),
      name: name || `telnet://${host}:${port}`,
      type: 'telnet',
      sessionId,
    };
    addTab(tab);
    return tab;
  }, [addTab]);

  const createSerialTab = useCallback(async (portName: string, baudRate: number, name?: string) => {
    const sessionId = await invoke<string>('create_serial_session', { portName, baudRate });
    const tab: Tab = {
      id: generateId(),
      name: name || `${portName} @ ${baudRate}`,
      type: 'serial',
      sessionId,
    };
    addTab(tab);
    return tab;
  }, [addTab]);

  const createFtpTab = useCallback(async (host: string, port: number, name?: string) => {
    const sessionId = await invoke<string>('create_ftp_session', { host, port });
    const tab: Tab = {
      id: generateId(),
      name: name || `ftp://${host}`,
      type: 'ftp',
      sessionId,
    };
    addTab(tab);
    return tab;
  }, [addTab]);

  const createS3Tab = useCallback(async (
    bucket: string, region?: string, accessKey?: string, secretKey?: string,
    endpoint?: string, name?: string,
  ) => {
    const sessionId = await invoke<string>('s3_connect', {
      region: region || null, accessKey: accessKey || null,
      secretKey: secretKey || null, endpoint: endpoint || null, bucket,
    });
    const tab: Tab = {
      id: generateId(),
      name: name || `s3://${bucket}`,
      type: 's3',
      sessionId,
    };
    addTab(tab);
    return tab;
  }, [addTab]);

  const createDockerTab = useCallback(async (containerId: string, containerName: string, shell?: string) => {
    const sessionId = await invoke<string>('create_docker_session', {
      containerId,
      shell: shell || null,
    });
    const tab: Tab = {
      id: generateId(),
      name: `docker: ${containerName}`,
      type: 'docker',
      sessionId,
    };
    addTab(tab);
    return tab;
  }, [addTab]);

  const createWslTab = useCallback(async (distro: string) => {
    const sessionId = await invoke<string>('create_wsl_session', { distro });
    const tab: Tab = {
      id: generateId(),
      name: `wsl: ${distro}`,
      type: 'wsl',
      sessionId,
    };
    addTab(tab);
    return tab;
  }, [addTab]);

  const launchRdp = useCallback(async (host: string, port?: number, username?: string) => {
    await invoke('launch_rdp', { host, port, username });
  }, []);

  const launchVnc = useCallback(async (host: string, port?: number) => {
    await invoke('launch_vnc', { host, port });
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.type === 's3') {
      try { await invoke('s3_disconnect', { s3Id: tab.sessionId }); } catch {}
    } else {
      try { await invoke('close_session', { sessionId: tab.sessionId }); } catch {}
      if (tab.sftpId) {
        try { await invoke('sftp_disconnect', { sftpId: tab.sftpId }); } catch {}
      }
    }

    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId && remaining.length > 0) {
        const closedIndex = prev.findIndex((t) => t.id === tabId);
        const newIndex = Math.min(closedIndex, remaining.length - 1);
        setActiveTabId(remaining[newIndex].id);
      } else if (remaining.length === 0) {
        setActiveTabId('');
      }
      return remaining;
    });
  }, [tabs, activeTabId]);

  const updateTerminalSize = useCallback((cols: number, rows: number) => {
    setTerminalSize({ cols, rows });
  }, []);

  // Auto-reconnect: listen for session-event closed, attempt reconnect for SSH tabs
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ session_id: string; event_type: string; message: string }>('session-event', (event) => {
      if (event.payload.event_type !== 'closed') return;
      const tab = tabs.find(t => t.sessionId === event.payload.session_id && t.type === 'ssh' && t.sshInfo);
      if (!tab || !tab.sshInfo) return;

      // Mark tab as disconnected
      setTabs(prev => prev.map(t =>
        t.id === tab.id ? { ...t, disconnected: true } : t
      ));

      // Attempt reconnect after 3 seconds using credential store lookup
      const info = tab.sshInfo;
      setTimeout(async () => {
        try {
          // Try auto-connect via credential store (no plaintext password in frontend)
          let newSessionId: string;
          try {
            newSessionId = await invoke<string>('auto_connect_session', {
              sessionName: tab.name,
            });
          } catch {
            // Fallback: reconnect with key-only auth
            newSessionId = await invoke<string>('create_ssh_session', {
              host: info.host,
              port: info.port,
              username: info.username,
              keyPath: info.keyPath,
            });
          }
          setTabs(prev => prev.map(t =>
            t.id === tab.id ? { ...t, sessionId: newSessionId, disconnected: false } : t
          ));
        } catch {
          // Reconnect failed — tab stays disconnected
        }
      }, 3000);
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [tabs]);

  // Broadcast mode: write to all broadcast targets
  const broadcastWrite = useCallback((data: string) => {
    for (const tab of tabs) {
      if (broadcastTargets.has(tab.id)) {
        invoke('write_session', { sessionId: tab.sessionId, data }).catch(() => {});
      }
    }
  }, [tabs, broadcastTargets]);

  return {
    tabs, activeTabId, terminalSize,
    broadcastMode, broadcastTargets,
    addTab, selectTab, createLocalTab, createSshTab,
    createTelnetTab, createSerialTab, createFtpTab,
    createS3Tab, createDockerTab, createWslTab,
    launchRdp, launchVnc,
    closeTab, updateTerminalSize,
    reorderTabs, setTabColor,
    setBroadcastMode, setBroadcastTargets, broadcastWrite,
  };
}
