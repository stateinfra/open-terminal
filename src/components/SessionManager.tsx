import React, { useState, useEffect, useCallback } from 'react';
import {
  VscChevronDown,
  VscChevronRight,
  VscChevronLeft,
  VscTerminal,
  VscTrash,
  VscAdd,
  VscFolder,
  VscSettingsGear,
  VscSearch,
  VscLock,
  VscKey,
  VscCloudDownload,
  VscSymbolVariable,
  VscSymbolClass,
} from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { SavedSession } from '../types';

interface SessionManagerProps {
  open: boolean;
  refreshKey?: number;
  onToggle: () => void;
  onNewLocal: () => void;
  onNewSsh: () => void;
  onOpenSettings?: () => void;
  onOpenPortScanner?: () => void;
  onOpenTunnels?: () => void;
  onOpenSshKeys?: () => void;
  onOpenImportExport?: () => void;
  onOpenPasswordMgr?: () => void;
  onOpenEnvVars?: () => void;
  onOpenTemplates?: () => void;
}

const TOOLS = [
  { key: 'scanner', icon: VscSearch, label: 'Port Scanner', prop: 'onOpenPortScanner' },
  { key: 'tunnels', icon: VscLock, label: 'SSH Tunnels', prop: 'onOpenTunnels' },
  { key: 'sshkeys', icon: VscKey, label: 'SSH Keys', prop: 'onOpenSshKeys' },
  { key: 'importexport', icon: VscCloudDownload, label: 'Import / Export', prop: 'onOpenImportExport' },
  { key: 'password', icon: VscLock, label: 'Password Manager', prop: 'onOpenPasswordMgr' },
  { key: 'envvars', icon: VscSymbolVariable, label: 'Environment Variables', prop: 'onOpenEnvVars' },
  { key: 'templates', icon: VscSymbolClass, label: 'Connection Templates', prop: 'onOpenTemplates' },
  { key: 'settings', icon: VscSettingsGear, label: 'Settings', prop: 'onOpenSettings' },
] as const;

const SessionManager: React.FC<SessionManagerProps> = (props) => {
  const {
    open, onToggle, onNewSsh, refreshKey,
  } = props;

  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Other']));
  const [userToolsOpen, setUserToolsOpen] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const loaded = await invoke<SavedSession[]>('load_sessions');
      setSessions(loaded);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  const handleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke('delete_session', { name });
    loadSessions();
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const otherSessions = sessions.filter((s) => !['ssh', 'local'].includes(s.session_type));

  // Collapsed: show icon-only toolbar
  if (!open) {
    return (
      <div className="session-mgr session-mgr--collapsed">
        <button className="session-mgr__icon-btn" onClick={onToggle} title="Expand">
          <VscChevronRight />
        </button>
        <button className="session-mgr__icon-btn" onClick={onNewSsh} title="New Connection">
          <VscAdd />
        </button>
        <div className="session-mgr__collapsed-sep" />
        {TOOLS.map(({ key, icon: Icon, label, prop }) => (
          <button
            key={key}
            className="session-mgr__icon-btn"
            onClick={(props as any)[prop]}
            title={label}
          >
            <Icon />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="session-mgr">
      <div className="session-mgr__header">
        <span className="session-mgr__title">Sessions</span>
        <div className="session-mgr__header-actions">
          <button className="session-mgr__icon-btn" onClick={onNewSsh} title="New Connection">
            <VscAdd />
          </button>
          <button className="session-mgr__icon-btn" onClick={onToggle} title="Hide">
            <VscChevronLeft />
          </button>
        </div>
      </div>

      <div className="session-mgr__content">
        {/* Other Sessions */}
        {otherSessions.length > 0 && (
          <div className="session-mgr__tree">
            <div className="tree-group">
              <div className="tree-group__header" onClick={() => toggleGroup('Other')}>
                {expandedGroups.has('Other') ? <VscChevronDown /> : <VscChevronRight />}
                <VscFolder className="tree-group__icon" />
                <span>Connections</span>
                <span className="tree-group__count">{otherSessions.length}</span>
              </div>
              {expandedGroups.has('Other') && (
                <div className="tree-group__items">
                  {otherSessions.map((session) => (
                    <div key={session.name} className="tree-item" onClick={() => {}}>
                      <VscTerminal className="tree-item__icon" />
                      <div className="tree-item__info">
                        <span className="tree-item__name">{session.name}</span>
                        <span className="tree-item__detail">
                          {session.session_type.toUpperCase()}{session.host ? ` - ${session.host}` : ''}
                        </span>
                      </div>
                      <div className="tree-item__actions">
                        <button
                          className="tree-item__action"
                          onClick={(e) => handleDelete(session.name, e)}
                          title="Delete"
                        >
                          <VscTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tools section */}
        <div className="session-mgr__tools">
          <div className="tree-group__header" onClick={() => setUserToolsOpen((p) => !p)}>
            {userToolsOpen ? <VscChevronDown /> : <VscChevronRight />}
            <VscSettingsGear className="tree-group__icon" />
            <span>Tools</span>
          </div>
          {userToolsOpen && (
            <div className="tree-group__items">
              {TOOLS.map(({ key, icon: Icon, label, prop }) => (
                <div key={key} className="tree-item" onClick={(props as any)[prop]}>
                  <Icon className="tree-item__icon" />
                  <span className="tree-item__name">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionManager;
