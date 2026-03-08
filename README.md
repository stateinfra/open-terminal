# Open Terminal

A free, open-source alternative to MobaXTerm and XPipe. Built with Tauri v2, React, and TypeScript.

## Features

- **SSH Terminal** with SFTP sidebar (file browser, drag & drop, chmod, remote editor)
- **Local Terminal** (PowerShell, Bash, CMD, WSL)
- **Multiple Protocols** -- SSH, Telnet, Serial/COM, FTP, RDP, VNC
- **S3 Browser** -- Browse buckets, upload/download objects
- **SSH Tools** -- Key generator, tunnel manager, agent forwarding, proxy jump, config import
- **Session Management** -- Save, group, tag, import/export, auto-login, connection templates
- **Remote Monitoring** -- CPU, memory, load graphs in status bar
- **Terminal Features** -- Split view, broadcast mode, clipboard history, command palette
- **Port Scanner** -- TCP port scanning
- **Password Manager** -- AES-256-GCM encrypted credential storage
- **15+ Themes** -- Catppuccin, Dracula, Nord, Tokyo Night, GitHub, Solarized, Gruvbox, and more
- **Settings Persistence** -- Theme and terminal preferences saved across sessions

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Quick Connect |
| `Ctrl+P` | Command Palette |
| `Ctrl+,` | Settings |
| `Ctrl+Shift+F` | Terminal Search |
| `Ctrl+Shift+V` | Clipboard History |
| `Ctrl+\` | Split horizontal |
| `Ctrl+Shift+\` | Split vertical |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.70+
- [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Tech Stack

- **Backend**: Rust (Tauri v2), portable-pty, ssh2, serialport, aws-sdk-s3
- **Frontend**: React, TypeScript, xterm.js, react-icons
- **Security**: AES-256-GCM encryption, Content Security Policy

## License

[MIT](LICENSE)
