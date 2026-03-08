import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { addToClipboardHistory } from './ClipboardHistory';
import { THEMES } from './SettingsDialog';

interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  cursorBlink: boolean;
  cursorStyle: 'block' | 'underline' | 'bar';
  scrollback: number;
}

interface TerminalPanelProps {
  sessionId: string;
  isActive: boolean;
  onResize?: (cols: number, rows: number) => void;
  settings?: TerminalSettings;
  themeId?: string;
  broadcastMode?: boolean;
  onBroadcastWrite?: (data: string) => void;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ sessionId, isActive, onResize, settings, themeId, broadcastMode, onBroadcastWrite }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null);

  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        invoke('resize_session', { sessionId, cols, rows }).catch(() => {});
        onResize?.(cols, rows);
      } catch {
        // not visible yet
      }
    }
  }, [sessionId, onResize]);

  useEffect(() => {
    if (!containerRef.current) return;

    const t = THEMES[themeId || 'catppuccin-mocha'] || THEMES['catppuccin-mocha'];
    const terminal = new Terminal({
      cursorBlink: settings?.cursorBlink ?? true,
      cursorStyle: settings?.cursorStyle ?? 'block',
      fontFamily: settings?.fontFamily ?? "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      fontSize: settings?.fontSize ?? 15,
      lineHeight: 1.2,
      scrollback: settings?.scrollback ?? 10000,
      theme: {
        background: t.background,
        foreground: t.foreground,
        cursor: t.cursor,
        selectionBackground: t.selectionBackground,
        black: t.black,
        red: t.red,
        green: t.green,
        yellow: t.yellow,
        blue: t.blue,
        magenta: t.magenta,
        cyan: t.cyan,
        white: t.white,
        brightBlack: t.brightBlack,
        brightRed: t.red,
        brightGreen: t.green,
        brightYellow: t.yellow,
        brightBlue: t.blue,
        brightMagenta: t.magenta,
        brightCyan: t.cyan,
        brightWhite: t.brightWhite,
      },
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    requestAnimationFrame(() => fitTerminal());

    // User input -> backend (+ broadcast if active)
    terminal.onData((data) => {
      invoke('write_session', { sessionId, data }).catch(() => {});
      if (broadcastMode && onBroadcastWrite) {
        onBroadcastWrite(data);
      }
    });

    // Backend output -> terminal (via events)
    let unlisten: UnlistenFn | null = null;
    listen<{ session_id: string; data: string }>('term-output', (event) => {
      if (event.payload.session_id === sessionId) {
        terminal.write(event.payload.data);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    // Session close event
    let unlistenClose: UnlistenFn | null = null;
    listen<{ session_id: string; event_type: string; message: string }>('session-event', (event) => {
      if (event.payload.session_id === sessionId && event.payload.event_type === 'closed') {
        terminal.write(`\r\n\x1b[33m[${event.payload.message}]\x1b[0m\r\n`);
      }
    }).then((fn) => {
      unlistenClose = fn;
    });

    // ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitTerminal());
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      unlisten?.();
      unlistenClose?.();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [sessionId, fitTerminal]);

  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => {
        fitTerminal();
        terminalRef.current?.focus();
      });
    }
  }, [isActive, fitTerminal]);

  // Update terminal theme when themeId changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const t = THEMES[themeId || 'catppuccin-mocha'] || THEMES['catppuccin-mocha'];
    terminal.options.theme = {
      background: t.background,
      foreground: t.foreground,
      cursor: t.cursor,
      selectionBackground: t.selectionBackground,
      black: t.black,
      red: t.red,
      green: t.green,
      yellow: t.yellow,
      blue: t.blue,
      magenta: t.magenta,
      cyan: t.cyan,
      white: t.white,
      brightBlack: t.brightBlack,
      brightRed: t.red,
      brightGreen: t.green,
      brightYellow: t.yellow,
      brightBlue: t.blue,
      brightMagenta: t.magenta,
      brightCyan: t.cyan,
      brightWhite: t.brightWhite,
    };
  }, [themeId]);

  // Update terminal settings when they change
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !settings) return;
    terminal.options.fontSize = settings.fontSize;
    terminal.options.fontFamily = settings.fontFamily;
    terminal.options.cursorBlink = settings.cursorBlink;
    terminal.options.cursorStyle = settings.cursorStyle;
    terminal.options.scrollback = settings.scrollback;
    requestAnimationFrame(() => fitTerminal());
  }, [settings, fitTerminal]);

  // Keyboard shortcut for search (Ctrl+Shift+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
      }
    };
    const container = containerRef.current?.parentElement;
    container?.addEventListener('keydown', handleKeyDown);
    return () => container?.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={`terminal-container ${isActive ? 'terminal-container--active' : ''}`}
      onContextMenu={handleContextMenu}
    >
      {showSearch && (
        <div className="terminal-search">
          <input className="terminal-search__input" type="text" placeholder="Search..."
            value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); searchAddonRef.current?.findNext(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.shiftKey ? searchAddonRef.current?.findPrevious(searchTerm) : searchAddonRef.current?.findNext(searchTerm); }
              if (e.key === 'Escape') { setShowSearch(false); }
            }}
            autoFocus />
          <button className="terminal-search__btn" onClick={() => searchAddonRef.current?.findPrevious(searchTerm)}>&#x25B2;</button>
          <button className="terminal-search__btn" onClick={() => searchAddonRef.current?.findNext(searchTerm)}>&#x25BC;</button>
          <button className="terminal-search__btn" onClick={() => setShowSearch(false)}>&#x2715;</button>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {contextMenu && (
        <div className="context-menu" style={{top: contextMenu.y, left: contextMenu.x}} onClick={() => setContextMenu(null)}>
          <button className="context-menu__item" onClick={() => {
            const sel = terminalRef.current?.getSelection() || '';
            navigator.clipboard.writeText(sel);
            addToClipboardHistory(sel);
            setContextMenu(null);
          }}>Copy</button>
          <button className="context-menu__item" onClick={async () => { const text = await navigator.clipboard.readText(); invoke('write_session', {sessionId, data: text}); setContextMenu(null); }}>Paste</button>
          <div className="context-menu__sep" />
          <button className="context-menu__item" onClick={() => { terminalRef.current?.selectAll(); setContextMenu(null); }}>Select All</button>
          <button className="context-menu__item" onClick={() => { terminalRef.current?.clear(); setContextMenu(null); }}>Clear</button>
          <div className="context-menu__sep" />
          <button className="context-menu__item" onClick={async () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logPath = `terminal-log-${timestamp}.txt`;
            try {
              await invoke('start_session_log', { sessionId, filePath: logPath });
              terminalRef.current?.write(`\r\n\x1b[32m[Logging started: ${logPath}]\x1b[0m\r\n`);
            } catch (err) {
              terminalRef.current?.write(`\r\n\x1b[31m[Log error: ${err}]\x1b[0m\r\n`);
            }
            setContextMenu(null);
          }}>Start Logging</button>
          <button className="context-menu__item" onClick={async () => {
            try {
              await invoke('stop_session_log', { sessionId });
              terminalRef.current?.write(`\r\n\x1b[33m[Logging stopped]\x1b[0m\r\n`);
            } catch { /* ignore */ }
            setContextMenu(null);
          }}>Stop Logging</button>
        </div>
      )}
    </div>
  );
};

export default TerminalPanel;
