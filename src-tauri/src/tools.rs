use std::io::Read as IoRead;
use std::net::TcpStream;
use std::path::PathBuf;
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use ssh2::Session as Ssh2Session;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::helpers::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// Docker Integration (XPipe-inspired)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct DockerContainer {
    id: String,
    name: String,
    image: String,
    status: String,
    state: String,
}

#[tauri::command]
pub fn list_docker_containers() -> Result<Vec<DockerContainer>, String> {
    let output = std::process::Command::new("docker")
        .args(["ps", "-a", "--format", "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.State}}"])
        .output()
        .map_err(|e| format!("Docker not available: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let containers: Vec<DockerContainer> = stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            DockerContainer {
                id: parts.first().unwrap_or(&"").to_string(),
                name: parts.get(1).unwrap_or(&"").to_string(),
                image: parts.get(2).unwrap_or(&"").to_string(),
                status: parts.get(3).unwrap_or(&"").to_string(),
                state: parts.get(4).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    Ok(containers)
}

#[tauri::command]
pub fn create_docker_session(
    container_id: String,
    shell: Option<String>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let sh = shell.unwrap_or_else(|| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new("docker");
    cmd.args(["exec", "-it", &container_id, &sh]);
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to exec into container: {}", e))?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session_id = Uuid::new_v4().to_string();

    {
        let mut sessions = SESSIONS.lock();
        sessions.insert(
            session_id.clone(),
            TermSession::Local(LocalSession {
                master: pair.master,
                writer,
                child,
            }),
        );
    }

    let sid = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut leftover = Vec::new();
        loop {
            let start = leftover.len();
            buf[..start].copy_from_slice(&leftover);
            leftover.clear();
            match reader.read(&mut buf[start..]) {
                Ok(0) => break,
                Ok(n) => {
                    let total = start + n;
                    let tail = incomplete_utf8_tail(&buf[..total]);
                    let valid = total - tail;
                    if tail > 0 {
                        leftover.extend_from_slice(&buf[valid..total]);
                    }
                    let data = String::from_utf8_lossy(&buf[..valid]).to_string();
                    let _ = app_handle.emit("term-output", TermOutput {
                        session_id: sid.clone(),
                        data,
                    });
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("session-event", SessionEvent {
            session_id: sid,
            event_type: "closed".to_string(),
            message: "Container session ended".to_string(),
        });
    });

    Ok(session_id)
}

// ---------------------------------------------------------------------------
// WSL Integration (XPipe-inspired)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct WslDistro {
    name: String,
    state: String,
    version: String,
    is_default: bool,
}

#[tauri::command]
pub fn list_wsl_distros() -> Result<Vec<WslDistro>, String> {
    let output = std::process::Command::new("wsl")
        .args(["--list", "--verbose"])
        .output()
        .map_err(|e| format!("WSL not available: {}", e))?;

    if !output.status.success() {
        return Err("WSL is not installed or not available".to_string());
    }

    // wsl --list --verbose outputs UTF-16LE on Windows
    let stdout_bytes = &output.stdout;
    let stdout = if stdout_bytes.len() >= 2 && stdout_bytes[0] == 0xFF && stdout_bytes[1] == 0xFE {
        // UTF-16 LE BOM
        let u16s: Vec<u16> = stdout_bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&u16s)
    } else {
        String::from_utf8_lossy(stdout_bytes).to_string()
    };

    let mut distros = Vec::new();
    for line in stdout.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() { continue; }

        let is_default = line.starts_with('*');
        let clean = line.trim_start_matches('*').trim();
        let parts: Vec<&str> = clean.split_whitespace().collect();
        if parts.len() >= 3 {
            distros.push(WslDistro {
                name: parts[0].to_string(),
                state: parts[1].to_string(),
                version: parts[2].to_string(),
                is_default,
            });
        }
    }

    Ok(distros)
}

#[tauri::command]
pub fn create_wsl_session(
    distro: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("wsl");
    cmd.args(["-d", &distro]);
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to launch WSL '{}': {}", distro, e))?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session_id = Uuid::new_v4().to_string();

    {
        let mut sessions = SESSIONS.lock();
        sessions.insert(
            session_id.clone(),
            TermSession::Local(LocalSession {
                master: pair.master,
                writer,
                child,
            }),
        );
    }

    let sid = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut leftover = Vec::new();
        loop {
            let start = leftover.len();
            buf[..start].copy_from_slice(&leftover);
            leftover.clear();
            match reader.read(&mut buf[start..]) {
                Ok(0) => break,
                Ok(n) => {
                    let total = start + n;
                    let tail = incomplete_utf8_tail(&buf[..total]);
                    let valid = total - tail;
                    if tail > 0 {
                        leftover.extend_from_slice(&buf[valid..total]);
                    }
                    let data = String::from_utf8_lossy(&buf[..valid]).to_string();
                    let _ = app_handle.emit("term-output", TermOutput {
                        session_id: sid.clone(),
                        data,
                    });
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("session-event", SessionEvent {
            session_id: sid,
            event_type: "closed".to_string(),
            message: "WSL session ended".to_string(),
        });
    });

    Ok(session_id)
}

// ---------------------------------------------------------------------------
// Script Snippets (XPipe-inspired)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct Snippet {
    id: String,
    name: String,
    description: String,
    command: String,
    tags: Vec<String>,
}

fn snippets_file_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join("open-terminal");
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("snippets.json"))
}

#[tauri::command]
pub fn load_snippets() -> Result<Vec<Snippet>, String> {
    let path = snippets_file_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_snippet(snippet: Snippet) -> Result<(), String> {
    let path = snippets_file_path()?;
    let mut snippets = if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Vec<Snippet>>(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    if let Some(existing) = snippets.iter_mut().find(|s| s.id == snippet.id) {
        *existing = snippet;
    } else {
        snippets.push(snippet);
    }

    let json = serde_json::to_string_pretty(&snippets).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_snippet(id: String) -> Result<(), String> {
    let path = snippets_file_path()?;
    if !path.exists() {
        return Ok(());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut snippets: Vec<Snippet> = serde_json::from_str(&data).unwrap_or_default();
    snippets.retain(|s| s.id != id);
    let json = serde_json::to_string_pretty(&snippets).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Connection Health Check (XPipe-inspired)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct HealthResult {
    host: String,
    reachable: bool,
    latency_ms: Option<u64>,
    ssh_banner: Option<String>,
    os_guess: Option<String>,
}

fn try_connect(addr: &str, timeout: std::time::Duration) -> Option<TcpStream> {
    if let Ok(sock_addr) = addr.parse::<std::net::SocketAddr>() {
        TcpStream::connect_timeout(&sock_addr, timeout).ok()
    } else {
        use std::net::ToSocketAddrs;
        addr.to_socket_addrs().ok()
            .and_then(|mut addrs| addrs.next())
            .and_then(|resolved| TcpStream::connect_timeout(&resolved, timeout).ok())
    }
}

fn guess_os_from_banner(banner: &str) -> String {
    let lower = banner.to_lowercase();
    if lower.contains("ubuntu") { "Ubuntu Linux".to_string() }
    else if lower.contains("debian") { "Debian Linux".to_string() }
    else if lower.contains("centos") { "CentOS Linux".to_string() }
    else if lower.contains("rhel") || lower.contains("redhat") { "Red Hat Linux".to_string() }
    else if lower.contains("fedora") { "Fedora Linux".to_string() }
    else if lower.contains("suse") { "SUSE Linux".to_string() }
    else if lower.contains("arch") { "Arch Linux".to_string() }
    else if lower.contains("alpine") { "Alpine Linux".to_string() }
    else if lower.contains("amazon") { "Amazon Linux".to_string() }
    else if lower.contains("freebsd") { "FreeBSD".to_string() }
    else if lower.contains("openbsd") { "OpenBSD".to_string() }
    else if lower.contains("windows") || lower.contains("microsoft") { "Windows".to_string() }
    else if lower.contains("openssh") { "Linux".to_string() }
    else if lower.contains("dropbear") { "Linux (Embedded)".to_string() }
    else { "Unknown".to_string() }
}

#[tauri::command]
pub fn check_host_health(host: String, port: Option<u16>) -> Result<HealthResult, String> {
    let port = port.unwrap_or(22);
    let addr = format!("{}:{}", host, port);
    let timeout = std::time::Duration::from_secs(3);
    let start = std::time::Instant::now();

    match try_connect(&addr, timeout) {
        Some(mut stream) => {
            let elapsed = start.elapsed();
            // Try to read SSH banner
            stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).ok();
            let mut banner_buf = [0u8; 256];
            let (ssh_banner, os_guess) = match stream.read(&mut banner_buf) {
                Ok(n) if n > 0 => {
                    let banner = String::from_utf8_lossy(&banner_buf[..n]).trim().to_string();
                    let os = guess_os_from_banner(&banner);
                    (Some(banner), Some(os))
                }
                _ => (None, None),
            };
            drop(stream);

            Ok(HealthResult {
                host,
                reachable: true,
                latency_ms: Some(elapsed.as_millis() as u64),
                ssh_banner,
                os_guess,
            })
        }
        None => {
            Ok(HealthResult {
                host,
                reachable: false,
                latency_ms: None,
                ssh_banner: None,
                os_guess: None,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// Remote OS Detection via SSH (XPipe-inspired)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct RemoteOsInfo {
    pretty_name: String,
    kernel: String,
    arch: String,
    shells: Vec<String>,
}

#[tauri::command]
pub fn detect_remote_os(
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
) -> Result<RemoteOsInfo, String> {
    let tcp = TcpStream::connect(format!("{}:{}", host, port))
        .map_err(|e| format!("Connection failed: {}", e))?;
    tcp.set_read_timeout(Some(std::time::Duration::from_secs(5))).ok();

    let mut sess = Ssh2Session::new().map_err(|e| e.to_string())?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake failed: {}", e))?;

    ssh_authenticate(&sess, &username, password.as_deref(), key_path.as_deref())?;

    // Run commands to detect OS info
    let run_cmd = |cmd: &str| -> String {
        match sess.channel_session() {
            Ok(mut ch) => {
                if ch.exec(cmd).is_ok() {
                    let mut out = String::new();
                    let _ = ch.read_to_string(&mut out);
                    let _ = ch.wait_close();
                    out.trim().to_string()
                } else {
                    String::new()
                }
            }
            Err(_) => String::new(),
        }
    };

    // Get PRETTY_NAME from /etc/os-release
    let os_release = run_cmd("cat /etc/os-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null || echo ''");
    let pretty_name = os_release
        .lines()
        .find(|l| l.starts_with("PRETTY_NAME="))
        .map(|l| l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
        .unwrap_or_else(|| {
            // Fallback: try first line of redhat-release, or uname -o
            if !os_release.is_empty() && !os_release.contains('=') {
                os_release.lines().next().unwrap_or("Unknown").to_string()
            } else {
                run_cmd("uname -o 2>/dev/null || echo Unknown")
            }
        });

    let kernel = run_cmd("uname -r 2>/dev/null || echo ''");
    let arch = run_cmd("uname -m 2>/dev/null || echo ''");

    // Detect available shells
    let shells_raw = run_cmd("cat /etc/shells 2>/dev/null || echo ''");
    let shells: Vec<String> = shells_raw
        .lines()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    let _ = sess.disconnect(None, "done", None);

    Ok(RemoteOsInfo {
        pretty_name,
        kernel,
        arch,
        shells,
    })
}

// ---------------------------------------------------------------------------
// System / Shell Environment Detection (XPipe-inspired)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    os_name: String,
    os_version: String,
    hostname: String,
    username: String,
    arch: String,
    shells: Vec<ShellInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ShellInfo {
    name: String,
    path: String,
    kind: String, // "powershell", "bash", "zsh", "cmd", "fish", "wsl", "docker"
}

#[tauri::command]
pub fn get_system_info(force_refresh: Option<bool>) -> Result<SystemInfo, String> {
    // Cache system info to avoid re-detecting every launch
    let config_base = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_base.join("open-terminal");
    let _ = std::fs::create_dir_all(&app_dir);
    let cache_path = app_dir.join("system_info_cache.json");
    if !force_refresh.unwrap_or(false) {
        if let Ok(metadata) = std::fs::metadata(&cache_path) {
            if let Ok(modified) = metadata.modified() {
                if modified.elapsed().unwrap_or(std::time::Duration::from_secs(u64::MAX))
                    < std::time::Duration::from_secs(86400) // 24 hours
                {
                    if let Ok(data) = std::fs::read_to_string(&cache_path) {
                        if let Ok(cached) = serde_json::from_str::<SystemInfo>(&data) {
                            return Ok(cached);
                        }
                    }
                }
            }
        }
    }

    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string());

    let (os_name, os_version) = if cfg!(target_os = "windows") {
        let ver = std::process::Command::new("cmd")
            .args(["/c", "ver"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        ("Windows".to_string(), ver)
    } else if cfg!(target_os = "macos") {
        let ver = std::process::Command::new("sw_vers")
            .args(["-productVersion"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        ("macOS".to_string(), ver)
    } else {
        let name = std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|c| {
                c.lines()
                    .find(|l| l.starts_with("PRETTY_NAME="))
                    .map(|l| l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "Linux".to_string());
        ("Linux".to_string(), name)
    };

    let arch = std::env::consts::ARCH.to_string();

    // Detect available shells
    let mut shells = Vec::new();

    if cfg!(target_os = "windows") {
        // PowerShell 7+
        if which_exists("pwsh.exe") {
            shells.push(ShellInfo {
                name: "PowerShell 7".to_string(),
                path: "pwsh.exe".to_string(),
                kind: "powershell".to_string(),
            });
        }
        // Windows PowerShell
        shells.push(ShellInfo {
            name: "Windows PowerShell".to_string(),
            path: "powershell.exe".to_string(),
            kind: "powershell".to_string(),
        });
        // CMD
        shells.push(ShellInfo {
            name: "Command Prompt".to_string(),
            path: "cmd.exe".to_string(),
            kind: "cmd".to_string(),
        });
        // Git Bash
        let git_bash = "C:\\Program Files\\Git\\bin\\bash.exe";
        if std::path::Path::new(git_bash).exists() {
            shells.push(ShellInfo {
                name: "Git Bash".to_string(),
                path: git_bash.to_string(),
                kind: "bash".to_string(),
            });
        }
    } else {
        // Unix shells
        for (name, path, kind) in &[
            ("Bash", "/bin/bash", "bash"),
            ("Zsh", "/bin/zsh", "zsh"),
            ("Fish", "/usr/bin/fish", "fish"),
            ("Sh", "/bin/sh", "sh"),
        ] {
            if std::path::Path::new(path).exists() {
                shells.push(ShellInfo {
                    name: name.to_string(),
                    path: path.to_string(),
                    kind: kind.to_string(),
                });
            }
        }
    }

    // Check WSL availability
    if cfg!(target_os = "windows") {
        if let Ok(output) = std::process::Command::new("wsl").args(["--list", "--quiet"]).output() {
            if output.status.success() {
                let stdout = if output.stdout.len() >= 2 && output.stdout[0] == 0xFF && output.stdout[1] == 0xFE {
                    let u16s: Vec<u16> = output.stdout[2..]
                        .chunks_exact(2)
                        .map(|c| u16::from_le_bytes([c[0], c[1]]))
                        .collect();
                    String::from_utf16_lossy(&u16s)
                } else {
                    String::from_utf8_lossy(&output.stdout).to_string()
                };
                for line in stdout.lines() {
                    let name = line.trim();
                    if !name.is_empty() {
                        shells.push(ShellInfo {
                            name: format!("WSL: {}", name),
                            path: format!("wsl -d {}", name),
                            kind: "wsl".to_string(),
                        });
                    }
                }
            }
        }
    }

    // Check Docker availability
    if let Ok(output) = std::process::Command::new("docker").args(["info", "--format", "{{.Name}}"]).output() {
        if output.status.success() {
            shells.push(ShellInfo {
                name: "Docker".to_string(),
                path: "docker".to_string(),
                kind: "docker".to_string(),
            });
        }
    }

    let info = SystemInfo {
        os_name,
        os_version,
        hostname,
        username,
        arch,
        shells,
    };

    // Write cache
    if let Ok(json) = serde_json::to_string_pretty(&info) {
        let _ = std::fs::write(&cache_path, json);
    }

    Ok(info)
}
