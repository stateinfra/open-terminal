import React, { useState } from 'react';
import { VscSettingsGear } from 'react-icons/vsc';

export interface TerminalTheme {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightWhite: string;
  // CSS variables for UI
  uiBase: string;
  uiMantle: string;
  uiCrust: string;
  uiSurface0: string;
  uiText: string;
}

export const THEMES: Record<string, TerminalTheme> = {
  'catppuccin-mocha': {
    name: 'Catppuccin Mocha',
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
    selectionBackground: '#45475a',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#cba6f7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightWhite: '#a6adc8',
    uiBase: '#1e1e2e', uiMantle: '#181825', uiCrust: '#11111b',
    uiSurface0: '#313244', uiText: '#cdd6f4',
  },
  'catppuccin-macchiato': {
    name: 'Catppuccin Macchiato',
    background: '#24273a', foreground: '#cad3f5', cursor: '#f4dbd6',
    selectionBackground: '#494d64',
    black: '#494d64', red: '#ed8796', green: '#a6da95', yellow: '#eed49f',
    blue: '#8aadf4', magenta: '#c6a0f6', cyan: '#8bd5ca', white: '#b8c0e0',
    brightBlack: '#5b6078', brightWhite: '#a5adcb',
    uiBase: '#24273a', uiMantle: '#1e2030', uiCrust: '#181926',
    uiSurface0: '#363a4f', uiText: '#cad3f5',
  },
  'catppuccin-frappe': {
    name: 'Catppuccin Frappé',
    background: '#303446', foreground: '#c6d0f5', cursor: '#f2d5cf',
    selectionBackground: '#51576d',
    black: '#51576d', red: '#e78284', green: '#a6d189', yellow: '#e5c890',
    blue: '#8caaee', magenta: '#ca9ee6', cyan: '#81c8be', white: '#b5bfe2',
    brightBlack: '#626880', brightWhite: '#a5adce',
    uiBase: '#303446', uiMantle: '#292c3c', uiCrust: '#232634',
    uiSurface0: '#414559', uiText: '#c6d0f5',
  },
  'dracula': {
    name: 'Dracula',
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
    selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightWhite: '#ffffff',
    uiBase: '#282a36', uiMantle: '#21222c', uiCrust: '#191a21',
    uiSurface0: '#44475a', uiText: '#f8f8f2',
  },
  'nord': {
    name: 'Nord',
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9',
    selectionBackground: '#434c5e',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightWhite: '#eceff4',
    uiBase: '#2e3440', uiMantle: '#272c36', uiCrust: '#21262e',
    uiSurface0: '#3b4252', uiText: '#d8dee9',
  },
  'tokyo-night': {
    name: 'Tokyo Night',
    background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5',
    selectionBackground: '#33467c',
    black: '#32344a', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#ad8ee6', cyan: '#449dab', white: '#787c99',
    brightBlack: '#444b6a', brightWhite: '#acb0d0',
    uiBase: '#1a1b26', uiMantle: '#16161e', uiCrust: '#12121a',
    uiSurface0: '#24283b', uiText: '#a9b1d6',
  },
  'catppuccin-latte': {
    name: 'Catppuccin Latte (Light)',
    background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78',
    selectionBackground: '#acb0be',
    black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#1e66f5', magenta: '#8839ef', cyan: '#179299', white: '#acb0be',
    brightBlack: '#6c6f85', brightWhite: '#bcc0cc',
    uiBase: '#eff1f5', uiMantle: '#e6e9ef', uiCrust: '#dce0e8',
    uiSurface0: '#ccd0da', uiText: '#4c4f69',
  },
  'github-light': {
    name: 'GitHub Light',
    background: '#ffffff', foreground: '#24292e', cursor: '#044289',
    selectionBackground: '#c8e1ff',
    black: '#24292e', red: '#d73a49', green: '#22863a', yellow: '#b08800',
    blue: '#0366d6', magenta: '#6f42c1', cyan: '#1b7c83', white: '#6a737d',
    brightBlack: '#959da5', brightWhite: '#d1d5da',
    uiBase: '#ffffff', uiMantle: '#f6f8fa', uiCrust: '#eaeef2',
    uiSurface0: '#e1e4e8', uiText: '#24292e',
  },
  'github-dark': {
    name: 'GitHub Dark',
    background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff',
    selectionBackground: '#264f78',
    black: '#484f58', red: '#ff7b72', green: '#7ee787', yellow: '#d29922',
    blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
    brightBlack: '#6e7681', brightWhite: '#f0f6fc',
    uiBase: '#0d1117', uiMantle: '#010409', uiCrust: '#000000',
    uiSurface0: '#161b22', uiText: '#c9d1d9',
  },
  'solarized-dark': {
    name: 'Solarized Dark',
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
    selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightWhite: '#fdf6e3',
    uiBase: '#002b36', uiMantle: '#001e26', uiCrust: '#00141a',
    uiSurface0: '#073642', uiText: '#839496',
  },
  'solarized-light': {
    name: 'Solarized Light',
    background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75',
    selectionBackground: '#eee8d5',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightWhite: '#fdf6e3',
    uiBase: '#fdf6e3', uiMantle: '#eee8d5', uiCrust: '#e4dcc8',
    uiSurface0: '#d6ceb5', uiText: '#657b83',
  },
  'one-dark': {
    name: 'One Dark',
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff',
    selectionBackground: '#3e4451',
    black: '#3f4451', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#d7dae0',
    brightBlack: '#4f5666', brightWhite: '#e6e6e6',
    uiBase: '#282c34', uiMantle: '#21252b', uiCrust: '#1b1d23',
    uiSurface0: '#31353f', uiText: '#abb2bf',
  },
  'gruvbox-dark': {
    name: 'Gruvbox Dark',
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2',
    selectionBackground: '#504945',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightWhite: '#fbf1c7',
    uiBase: '#282828', uiMantle: '#1d2021', uiCrust: '#141617',
    uiSurface0: '#3c3836', uiText: '#ebdbb2',
  },
  'rose-pine': {
    name: 'Rosé Pine',
    background: '#191724', foreground: '#e0def4', cursor: '#524f67',
    selectionBackground: '#2a283e',
    black: '#26233a', red: '#eb6f92', green: '#31748f', yellow: '#f6c177',
    blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4',
    brightBlack: '#6e6a86', brightWhite: '#e0def4',
    uiBase: '#191724', uiMantle: '#1f1d2e', uiCrust: '#16141f',
    uiSurface0: '#26233a', uiText: '#e0def4',
  },
  'ayu-dark': {
    name: 'Ayu Dark',
    background: '#0a0e14', foreground: '#b3b1ad', cursor: '#e6b450',
    selectionBackground: '#253340',
    black: '#01060e', red: '#ea6c73', green: '#91b362', yellow: '#f9af4f',
    blue: '#53bdfa', magenta: '#fae994', cyan: '#90e1c6', white: '#c7c7c7',
    brightBlack: '#686868', brightWhite: '#fafafa',
    uiBase: '#0a0e14', uiMantle: '#060a10', uiCrust: '#03060a',
    uiSurface0: '#1a1f29', uiText: '#b3b1ad',
  },
};

interface Settings {
  fontSize: number;
  fontFamily: string;
  cursorBlink: boolean;
  cursorStyle: 'block' | 'underline' | 'bar';
  scrollback: number;
}

interface SettingsDialogProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
  currentTheme?: string;
  onThemeChange?: (themeId: string) => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ settings, onSave, onClose, currentTheme, onThemeChange }) => {
  const [local, setLocal] = useState<Settings>({ ...settings });
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'catppuccin-mocha');

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={e => e.stopPropagation()}>
        <div className="dialog__header">
          <VscSettingsGear className="dialog__header-icon" />
          <h2 className="dialog__title">Settings</h2>
        </div>
        <div className="dialog__body">
          {/* Theme Selection */}
          <div className="dialog__section">
            <div className="dialog__section-title">Theme</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem', maxHeight: '14rem', overflowY: 'auto' }}>
              {Object.entries(THEMES).map(([id, theme]) => (
                <button
                  key={id}
                  onClick={() => { setSelectedTheme(id); onThemeChange?.(id); }}
                  style={{
                    padding: 'var(--sp-2)', borderRadius: 'var(--r-sm)',
                    border: selectedTheme === id ? '2px solid var(--blue)' : '2px solid transparent',
                    background: theme.uiBase, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: theme.uiText, marginBottom: 4 }}>{theme.name}</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[theme.red, theme.green, theme.blue, theme.yellow, theme.magenta, theme.cyan].map((c, i) => (
                      <span key={i} style={{ width: 12, height: 12, borderRadius: 2, background: c, display: 'inline-block' }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="dialog__section">
            <div className="dialog__section-title">Terminal</div>
            <div className="dialog__field-row">
              <div className="dialog__field dialog__field--grow">
                <label className="dialog__label">Font Family</label>
                <input className="dialog__input" type="text" value={local.fontFamily} onChange={e => setLocal({...local, fontFamily: e.target.value})} />
              </div>
              <div className="dialog__field dialog__field--small">
                <label className="dialog__label">Font Size</label>
                <input className="dialog__input" type="number" value={local.fontSize} onChange={e => setLocal({...local, fontSize: parseInt(e.target.value) || 14})} />
              </div>
            </div>
            <div className="dialog__field-row">
              <div className="dialog__field dialog__field--grow">
                <label className="dialog__label">Cursor Style</label>
                <select className="dialog__input" value={local.cursorStyle} onChange={e => setLocal({...local, cursorStyle: e.target.value as any})}>
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                  <option value="bar">Bar</option>
                </select>
              </div>
              <div className="dialog__field dialog__field--grow">
                <label className="dialog__label">Scrollback Lines</label>
                <input className="dialog__input" type="number" value={local.scrollback} onChange={e => setLocal({...local, scrollback: parseInt(e.target.value) || 1000})} />
              </div>
            </div>
            <div className="dialog__field">
              <label className="dialog__checkbox">
                <input type="checkbox" checked={local.cursorBlink} onChange={e => setLocal({...local, cursorBlink: e.target.checked})} />
                Cursor Blink
              </label>
            </div>
          </div>
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Cancel</button>
          <button className="dialog__btn dialog__btn--primary" onClick={() => { onSave(local); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
