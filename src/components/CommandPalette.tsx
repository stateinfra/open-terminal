import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  VscTerminal, VscRemoteExplorer, VscSettingsGear, VscSearch,
  VscRadioTower, VscBroadcast, VscPackage, VscCode, VscLock,
  VscKey, VscCloudDownload, VscRecord,
} from 'react-icons/vsc';

interface PaletteAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ actions, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(a => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement;
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="dialog-overlay" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="cmd-palette"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="cmd-palette__input-wrap">
          <VscSearch className="cmd-palette__search-icon" />
          <input
            ref={inputRef}
            className="cmd-palette__input"
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="cmd-palette__list" ref={listRef}>
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={`cmd-palette__item ${i === selectedIndex ? 'cmd-palette__item--active' : ''}`}
              onClick={() => { item.action(); onClose(); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="cmd-palette__item-icon">{item.icon}</span>
              <span className="cmd-palette__item-label">{item.label}</span>
              {item.shortcut && (
                <span className="cmd-palette__item-shortcut">{item.shortcut}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="cmd-palette__empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
