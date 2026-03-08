# Open Terminal - Project Instructions

## Overview
MobaXTerm + XPipe alternative built with Tauri v2 (Rust) + React + TypeScript.
Multiple themes supported. Frameless window with custom title bar. Pinned Home tab.

## Tech Stack
- **Backend**: Rust (Tauri v2), portable-pty, ssh2, serialport, aws-sdk-s3
- **Frontend**: React + TypeScript, xterm.js, react-icons
- **Theme**: 15+ themes (Catppuccin, Dracula, Nord, Tokyo Night, GitHub, Solarized, Gruvbox, etc.)
- **Key files**: `src-tauri/src/lib.rs` (all Rust commands), `src/App.tsx` (main UI)

## Feature Implementation Status

### DONE
- [x] SSH Terminal (ssh2 crate + xterm.js)
- [x] SFTP Sidebar (file browser, drag & drop, context menu with chmod/rename/copy path/new file)
- [x] Local PTY (portable-pty, PowerShell/Bash/CMD)
- [x] Telnet (raw TCP)
- [x] Serial/COM Port (serialport crate)
- [x] RDP Launch (mstsc.exe)
- [x] VNC Launch (external viewer)
- [x] FTP Session (raw commands)
- [x] S3 Browser (aws-sdk-s3, bucket/object browse, upload/download)
- [x] Docker Container Attach (PTY)
- [x] WSL Session (PTY)
- [x] Port Scanner (TCP scan)
- [x] Quick Connect Bar (user@host:port)
- [x] Connection Health Check (TCP + SSH banner)
- [x] Remote OS Detection (detect_remote_os via SSH)
- [x] System Info (local OS, hostname, shells)
- [x] Session Save/Load/Delete (JSON file)
- [x] Edit Session Dialog
- [x] SSH Tunnel Manager (backend + UI: TunnelManager.tsx)
- [x] Session Logging (backend + context menu Start/Stop Logging)
- [x] Session Import/Export (backend + SessionImportExport.tsx)
- [x] SSH Config Parser (~/.ssh/config auto-import: parse_ssh_config + import_ssh_config)
- [x] SSH Key Generator (ssh-keygen GUI: SshKeyManager.tsx + generate_ssh_key + list_ssh_keys)
- [x] Terminal Split View (Ctrl+\ horizontal, Ctrl+Shift+\ vertical)
- [x] Settings Dialog (font, cursor, scrollback, theme selection)
- [x] OS Brand Icons (react-icons: Ubuntu, Debian, Windows, etc.)
- [x] Tab Bar with protocol icons
- [x] XPipe-style Connection Hub (WelcomeTab / Home tab)
- [x] Connection Groups/Folders (group field on sessions)
- [x] Password Manager (credential store: PasswordManager.tsx)
- [x] Tab Drag & Drop Reorder (TabBar.tsx drag/drop)
- [x] Terminal Broadcast Mode (real-time input to multiple tabs)
- [x] Auto-Reconnect SSH (session-event listener, 3s retry)
- [x] Quick Command Palette (Ctrl+P, CommandPalette.tsx)
- [x] Terminal Appearance Per-Tab (tab color via context menu)
- [x] Clipboard History (Ctrl+Shift+V, ClipboardHistory.tsx)
- [x] SSH Bookmark Tags (tags field on SavedSession)
- [x] System Info Caching (24h file cache for get_system_info)
- [x] Multiple Themes (Catppuccin variants, Dracula, Nord, Tokyo Night, GitHub Light/Dark, Solarized, One Dark, Gruvbox, Rose Pine, Ayu Dark)
- [x] Dynamic Terminal Theme (live theme switching applies to xterm.js + UI)
- [x] Connection Duplication (via EditSessionDialog)
- [x] Public Key Distribution (distribute_public_key: ssh-copy-id equivalent)
- [x] Connection Templates (TemplateManager.tsx)
- [x] Environment Variable Presets (EnvVarManager.tsx)
- [x] Host Key Verification (ssh2 handshake in distribute_public_key flow)
- [x] Proxy Jump / Gateway (system ssh -J via PTY: create_proxy_ssh_session)
- [x] SFTP Transfer Progress Bar (chunked transfer with sftp-progress events)
- [x] SSH Agent Forwarding (agent_forwarding param on create_ssh_session)
- [x] Session Auto-Login (auto_connect_session: credential lookup + SSH connect)
- [x] Remote File Editor (SFTP download -> textarea editor -> re-upload: RemoteFileEditor.tsx)
- [x] SFTP Bookmarks (save_sftp_bookmark/load_sftp_bookmarks/delete_sftp_bookmark)
- [x] Remote System Monitor (inline bottom panel with Canvas graphs: RemoteMonitor.tsx)
- [x] Native Windows UI overhaul (compact spacing, flat controls, no blur/shadows)
- [x] SFTP Drag & Drop Transfer (HTML5 drag API + context menu with chmod, copy path, new file)
- [x] SFTP chmod (sftp_chmod backend command)
- [x] Pinned Home Tab (always first tab, WelcomeTab)
- [x] AES-256-GCM Credential Encryption (aes-gcm crate, legacy XOR migration)
- [x] Content Security Policy (CSP in tauri.conf.json)
- [x] Settings Persistence (localStorage: theme + terminal settings)
- [x] Per-Tab Remote Monitoring (StatusBar sparklines, per-session cache)
- [x] Connection Disconnect Indicator (blinking red dot on tab, auto-reconnect)
- [x] i18n English UI (all strings unified to English)

### Backend-only (UI removed from sidebar, accessible via Command Palette)
- [x] Wake-on-LAN (magic packet: WolDialog.tsx)
- [x] Network Tools (Ping/Traceroute/Nslookup: NetworkTools.tsx)
- [x] Macro Recording (keystroke record/replay: MacroManager.tsx)
- [x] Built-in Local HTTP Server (start_http_server/stop_http_server: LocalServerManager.tsx)
- [x] Network Connections Viewer (get_network_connections: NetworkCapture.tsx)
- [x] Multi-Exec Bar (send command to multiple tabs)
- [x] Script Snippets Manager (CRUD, run to terminal: SnippetManager.tsx)
- [x] Environment Hub (Docker/WSL browser: EnvironmentHub.tsx)

### TODO - Remaining features
- [ ] SFTP Transfer Queue & Retry (queued transfers with failure retry)
- [ ] Embedded VNC Viewer (noVNC in tab)
- [ ] Embedded RDP Viewer (ironrdp in tab)
- [ ] Terminal Syntax Highlighting (log file color coding)

## Keyboard Shortcuts
- `Ctrl+K` -- Quick Connect
- `Ctrl+P` -- Command Palette
- `Ctrl+,` -- Settings
- `Ctrl+Shift+F` -- Terminal Search
- `Ctrl+Shift+V` -- Clipboard History
- `Ctrl+\` -- Split terminal horizontally
- `Ctrl+Shift+\` -- Split terminal vertically

## Conventions
- All Rust commands: `#[tauri::command]` in `src-tauri/src/lib.rs`
- All React components: `src/components/*.tsx`
- Types shared: `src/types.ts`
- Styles: `src/styles/global.css` (BEM naming: `.block__element--modifier`)
- CSS variables: `--fs-*` (font), `--sp-*` (spacing), `--r-*` (radius)
- Session refresh: increment `sessionRefreshKey` in App.tsx
- UI language: English
- Security: AES-256-GCM credential encryption (aes-gcm crate)
- Settings persistence: localStorage (`ot-theme`, `ot-settings`)
