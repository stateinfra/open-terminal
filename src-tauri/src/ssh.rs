use std::io::{Read as IoRead, Write as IoWrite};
use std::net::TcpStream;
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use ssh2::Session as Ssh2Session;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::helpers::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// SSH Terminal (interactive shell via ssh2 channel)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_ssh_session(
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
    agent_forwarding: Option<bool>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let tcp = TcpStream::connect(format!("{}:{}", host, port))
        .map_err(|e| format!("Connection failed: {}", e))?;

    // Enable TCP keepalive to prevent idle disconnects
    let socket = socket2::SockRef::from(&tcp);
    let keepalive = socket2::TcpKeepalive::new()
        .with_time(std::time::Duration::from_secs(30))
        .with_interval(std::time::Duration::from_secs(15));
    let _ = socket.set_tcp_keepalive(&keepalive);

    let mut sess = Ssh2Session::new().map_err(|e| e.to_string())?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("SSH handshake failed: {}", e))?;

    // Enable SSH-level keepalive every 15 seconds
    sess.set_keepalive(true, 15);

    // Authenticate
    ssh_authenticate(&sess, &username, password.as_deref(), key_path.as_deref())?;

    // Open interactive shell channel with PTY
    let mut channel = sess.channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;

    channel.request_pty("xterm-256color", None, Some((120, 30, 0, 0)))
        .map_err(|e| format!("Failed to request PTY: {}", e))?;

    if agent_forwarding.unwrap_or(false) {
        channel.request_auth_agent_forwarding()
            .map_err(|e| format!("Agent forwarding failed: {}", e))?;
    }

    channel.shell()
        .map_err(|e| format!("Failed to start shell: {}", e))?;

    // Set non-blocking for the read thread
    sess.set_blocking(false);

    // We need a separate stream for reading. ssh2 channel is !Send by default
    // because it borrows the session. We'll use a pipe-based approach:
    // clone the underlying TCP stream for the reader thread.
    let session_id = Uuid::new_v4().to_string();

    // For ssh2, channel read/write must happen from same thread or be carefully managed.
    // We'll use a writer pipe and a reader thread with the session set to non-blocking.
    let (write_tx, write_rx) = std::sync::mpsc::channel::<Vec<u8>>();
    let (resize_tx, resize_rx) = std::sync::mpsc::channel::<(u32, u32)>();

    {
        let mut sessions = SESSIONS.lock();
        sessions.insert(
            session_id.clone(),
            TermSession::Ssh(SshTermSession {
                writer: Box::new(ChannelWriter { tx: write_tx }),
            }),
        );
    }

    // Single thread that owns both channel read and write
    let sid = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut leftover = Vec::new();
        loop {
            // Process pending writes
            while let Ok(data) = write_rx.try_recv() {
                if channel.write_all(&data).is_err() {
                    let _ = app_handle.emit("session-event", SessionEvent {
                        session_id: sid.clone(),
                        event_type: "closed".to_string(),
                        message: "Write error".to_string(),
                    });
                    return;
                }
                let _ = channel.flush();
            }

            // Process pending resizes
            while let Ok((cols, rows)) = resize_rx.try_recv() {
                let _ = channel.request_pty_size(cols, rows, None, None);
            }

            // Try to read output
            let start = leftover.len();
            buf[..start].copy_from_slice(&leftover);
            leftover.clear();
            match channel.read(&mut buf[start..]) {
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
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Send SSH keepalive during idle periods
                    let _ = sess.keepalive_send();
                    thread::sleep(std::time::Duration::from_millis(10));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut
                    || e.kind() == std::io::ErrorKind::Interrupted => {
                    // Transient errors — retry
                    thread::sleep(std::time::Duration::from_millis(10));
                }
                Err(_) => break,
            }

            if channel.eof() {
                break;
            }
        }

        let _ = channel.wait_close();
        let _ = sess.disconnect(None, "bye", None);
        let _ = app_handle.emit("session-event", SessionEvent {
            session_id: sid.clone(),
            event_type: "closed".to_string(),
            message: "SSH session closed".to_string(),
        });

        // Clean up from global state
        SESSIONS.lock().remove(&sid);
    });

    // Store resize sender alongside for resize commands
    RESIZE_SENDERS.lock().insert(session_id.clone(), resize_tx);

    Ok(session_id)
}

// Channel writer that sends data via mpsc to the SSH thread
pub struct ChannelWriter {
    pub tx: std::sync::mpsc::Sender<Vec<u8>>,
}

impl IoWrite for ChannelWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.tx.send(buf.to_vec())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::BrokenPipe, e))?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Proxy Jump / Gateway SSH (uses system ssh -J)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_proxy_ssh_session(
    jump_host: String,
    jump_port: u16,
    jump_user: String,
    target_host: String,
    target_port: u16,
    target_user: String,
    identity_file: Option<String>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("ssh");
    cmd.arg("-J");
    cmd.arg(format!("{}@{}:{}", jump_user, jump_host, jump_port));
    cmd.arg(format!("{}@{}", target_user, target_host));
    cmd.arg("-p");
    cmd.arg(target_port.to_string());
    if let Some(ref key) = identity_file {
        cmd.arg("-i");
        cmd.arg(key);
    }
    cmd.arg("-o");
    cmd.arg("StrictHostKeyChecking=accept-new");

    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn ssh: {}", e))?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let session_id = Uuid::new_v4().to_string();

    {
        let mut sessions = SESSIONS.lock();
        sessions.insert(session_id.clone(), TermSession::Local(LocalSession {
            master: pair.master, writer, child,
        }));
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
                    let _ = app_handle.emit("term-output", TermOutput { session_id: sid.clone(), data });
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("session-event", SessionEvent {
            session_id: sid, event_type: "closed".to_string(), message: "Proxy SSH session closed".to_string(),
        });
    });

    Ok(session_id)
}

// ---------------------------------------------------------------------------
// Session Auto-Login (credential-based auto connect)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn auto_connect_session(
    session_name: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    // Load sessions
    let sessions_path = sessions_file_path()?;
    let sessions_data = std::fs::read_to_string(&sessions_path).map_err(|e| e.to_string())?;
    let sessions: Vec<SavedSession> = serde_json::from_str(&sessions_data).unwrap_or_default();

    let session = sessions.iter().find(|s| s.name == session_name)
        .ok_or_else(|| format!("Session '{}' not found", session_name))?;

    if session.session_type != "ssh" {
        return Err("Auto-login only supports SSH sessions".to_string());
    }

    let host = session.host.clone().ok_or("No host configured")?;
    let port = session.port.unwrap_or(22);
    let username = session.username.clone().ok_or("No username configured")?;

    // Try to find matching credential
    let cred_path = {
        let config_dir = dirs::config_dir().ok_or("Config dir not found")?;
        config_dir.join("open-terminal").join("credentials.json")
    };

    let mut password: Option<String> = None;
    if cred_path.exists() {
        let cred_data = std::fs::read_to_string(&cred_path).map_err(|e| e.to_string())?;
        let creds: Vec<serde_json::Value> = serde_json::from_str(&cred_data).unwrap_or_default();
        for cred in &creds {
            let cred_host = cred.get("host").and_then(|v| v.as_str()).unwrap_or("");
            let cred_user = cred.get("username").and_then(|v| v.as_str()).unwrap_or("");
            if cred_host == host && cred_user == username {
                if let Some(encoded) = cred.get("password").and_then(|v| v.as_str()) {
                    match aes_decrypt(encoded) {
                        Ok(plain) => password = Some(plain),
                        Err(e) if e.starts_with("LEGACY:") => {
                            password = Some(legacy_xor_decode(&e[7..]));
                        }
                        Err(_) => {}
                    }
                }
                break;
            }
        }
    }

    create_ssh_session(host, port, username, password, session.identity_file.clone(), None, app_handle)
}
