import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { VscTerminal, VscChromeMinimize, VscChromeMaximize, VscChromeClose } from 'react-icons/vsc';

const isMac = navigator.userAgent.includes('Macintosh');

const TitleBar: React.FC = () => {
  const appWindow = getCurrentWindow();

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = () => {
    appWindow.toggleMaximize();
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" style={isMac ? { paddingLeft: '4.5rem' } : undefined}>
        <VscTerminal />
        <span>Open Terminal</span>
      </div>
      {!isMac && (
        <div className="titlebar__controls">
          <button className="titlebar__btn" onClick={handleMinimize} aria-label="Minimize">
            <VscChromeMinimize />
          </button>
          <button className="titlebar__btn" onClick={handleMaximize} aria-label="Maximize">
            <VscChromeMaximize />
          </button>
          <button
            className="titlebar__btn titlebar__btn--close"
            onClick={handleClose}
            aria-label="Close"
          >
            <VscChromeClose />
          </button>
        </div>
      )}
    </div>
  );
};

export default TitleBar;
