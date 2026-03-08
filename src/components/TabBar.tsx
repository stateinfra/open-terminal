import React, { useState, useEffect } from 'react';
import {
  VscTerminal, VscClose, VscHome,
  VscPlug, VscDesktopDownload, VscScreenFull, VscFolder,
  VscCloudUpload, VscPackage, VscVm,
} from 'react-icons/vsc';
import { Tab, SessionType } from '../types';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  isHomeActive: boolean;
  onSelectTab: (tabId: string) => void;
  onSelectHome: () => void;
  onCloseTab: (tabId: string) => void;
  onReorderTabs?: (tabs: Tab[]) => void;
  onSetTabColor?: (tabId: string, color: string | undefined) => void;
}

const TAB_ICONS: Record<SessionType, React.ReactNode> = {
  local: <VscTerminal />,
  ssh: <VscTerminal />,
  telnet: <VscTerminal />,
  serial: <VscPlug />,
  rdp: <VscDesktopDownload />,
  vnc: <VscScreenFull />,
  ftp: <VscFolder />,
  s3: <VscCloudUpload />,
  docker: <VscPackage />,
  wsl: <VscVm />,
};

const TAB_COLORS = [
  { name: 'Red', value: '#f38ba8' },
  { name: 'Green', value: '#a6e3a1' },
  { name: 'Blue', value: '#89b4fa' },
  { name: 'Yellow', value: '#f9e2af' },
  { name: 'Mauve', value: '#cba6f7' },
  { name: 'Peach', value: '#fab387' },
  { name: 'Teal', value: '#94e2d5' },
];

const TabBar: React.FC<TabBarProps> = ({
  tabs, activeTabId, isHomeActive, onSelectTab, onSelectHome, onCloseTab, onReorderTabs, onSetTabColor,
}) => {
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [contextMenuTab, setContextMenuTab] = useState<{ tabId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!contextMenuTab) return;
    const handleClickOutside = () => setContextMenuTab(null);
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenuTab]);

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDragTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTabId(tabId);
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (!dragTabId || dragTabId === targetTabId || !onReorderTabs) return;
    const newTabs = [...tabs];
    const dragIdx = newTabs.findIndex(t => t.id === dragTabId);
    const targetIdx = newTabs.findIndex(t => t.id === targetTabId);
    if (dragIdx < 0 || targetIdx < 0) return;
    const [moved] = newTabs.splice(dragIdx, 1);
    newTabs.splice(targetIdx, 0, moved);
    onReorderTabs(newTabs);
    setDragTabId(null);
    setDragOverTabId(null);
  };

  const handleDragEnd = () => {
    setDragTabId(null);
    setDragOverTabId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenuTab({ tabId, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="tabbar">
      <div
        className={`tab tab--home ${isHomeActive ? 'tab--active' : ''}`}
        onClick={onSelectHome}
      >
        <span className="tab__icon"><VscHome /></span>
        <span className="tab__name">Home</span>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'tab--active' : ''} ${dragOverTabId === tab.id && dragTabId !== tab.id ? 'tab--drag-over' : ''}`}
          onClick={() => onSelectTab(tab.id)}
          draggable
          onDragStart={(e) => handleDragStart(e, tab.id)}
          onDragOver={(e) => handleDragOver(e, tab.id)}
          onDrop={(e) => handleDrop(e, tab.id)}
          onDragEnd={handleDragEnd}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
          style={tab.color ? { borderTopColor: tab.color, borderTopWidth: 2, borderTopStyle: 'solid' } : undefined}
        >
          <span className="tab__icon">{TAB_ICONS[tab.type] || <VscTerminal />}</span>
          <span className="tab__name">{tab.name}</span>
          {tab.disconnected && (
            <span className="tab__disconnected" title="Disconnected — reconnecting...">●</span>
          )}
          {tab.color && (
            <span className="tab__color-dot" style={{ background: tab.color }} />
          )}
          <button className="tab__close"
            onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
            aria-label={`Close ${tab.name}`}>
            <VscClose />
          </button>
        </div>
      ))}

      {/* Tab context menu for color */}
      {contextMenuTab && onSetTabColor && (
        <div className="context-menu" style={{ top: contextMenuTab.y, left: contextMenuTab.x, zIndex: 100 }}>
          <div style={{ padding: '4px 8px', fontSize: 'var(--fs-xs)', color: 'var(--subtext0)', fontWeight: 600 }}>Tab Color</div>
          <div style={{ display: 'flex', gap: 4, padding: '4px 8px' }}>
            {TAB_COLORS.map(c => (
              <button
                key={c.value}
                style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: c.value, border: 'none', cursor: 'pointer',
                }}
                title={c.name}
                onClick={() => { onSetTabColor(contextMenuTab.tabId, c.value); setContextMenuTab(null); }}
              />
            ))}
            <button
              style={{
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--surface1)', border: '1px dashed var(--overlay0)',
                cursor: 'pointer', fontSize: 8, color: 'var(--subtext0)',
              }}
              title="Remove Color"
              onClick={() => { onSetTabColor(contextMenuTab.tabId, undefined); setContextMenuTab(null); }}
            >
              ✕
            </button>
          </div>
          <div className="context-menu__sep" />
          <button className="context-menu__item" onClick={() => { onCloseTab(contextMenuTab.tabId); setContextMenuTab(null); }}>Close Tab</button>
        </div>
      )}
    </div>
  );
};

export default TabBar;
