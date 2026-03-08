use std::io::{Read as IoRead, Write as IoWrite};
use std::net::TcpStream;
use std::thread;

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::ssh::ChannelWriter;
use crate::types::*;

// ---------------------------------------------------------------------------
// Telnet
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_telnet_session(
    host: String,
    port: u16,
    app_handle: AppHandle,
) -> Result<String, String> {
    let stream = TcpStream::connect(format!("{}:{}", host, port))
        .map_err(|e| format!("Telnet connection failed: {}", e))?;

    let mut reader = stream.try_clone().map_err(|e| e.to_string())?;
    let writer = stream;

    let session_id = Uuid::new_v4().to_string();
    let (write_tx, write_rx) = std::sync::mpsc::channel::<Vec<u8>>();

    {
        let mut sessions = SESSIONS.lock();
        sessions.insert(
            session_id.clone(),
            TermSession::Ssh(SshTermSession {
                writer: Box::new(ChannelWriter { tx: write_tx }),
            }),
        );
    }

    let sid = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        // Set non-blocking for reads
        writer.set_nonblocking(true).ok();

        loop {
            // Process writes
            while let Ok(data) = write_rx.try_recv() {
                let mut w = &writer;
                if w.write_all(&data).is_err() {
                    break;
                }
                w.flush().ok();
            }

            // Read output
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    // Basic telnet: strip IAC commands (0xFF ...)
                    let mut clean = Vec::with_capacity(n);
                    let mut i = 0;
                    while i < n {
                        if buf[i] == 0xFF && i + 2 < n {
                            // IAC DO/DONT/WILL/WONT - respond with WONT/DONT
                            let cmd = buf[i + 1];
                            let opt = buf[i + 2];
                            if cmd == 0xFD {
                                // DO -> respond WONT
                                let mut w = &writer;
                                w.write_all(&[0xFF, 0xFC, opt]).ok();
                            } else if cmd == 0xFB {
                                // WILL -> respond DONT
                                let mut w = &writer;
                                w.write_all(&[0xFF, 0xFE, opt]).ok();
                            }
                            i += 3;
                        } else if buf[i] == 0xFF && i + 1 < n {
                            i += 2;
                        } else {
                            clean.push(buf[i]);
                            i += 1;
                        }
                    }
                    if !clean.is_empty() {
                        let data = String::from_utf8_lossy(&clean).to_string();
                        let _ = app_handle.emit("term-output", TermOutput {
                            session_id: sid.clone(),
                            data,
                        });
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(_) => break,
            }
        }

        let _ = app_handle.emit("session-event", SessionEvent {
            session_id: sid.clone(),
            event_type: "closed".to_string(),
            message: "Telnet connection closed".to_string(),
        });
        SESSIONS.lock().remove(&sid);
    });

    Ok(session_id)
}

// ---------------------------------------------------------------------------
// Serial Port
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| p.port_name).collect())
}

#[tauri::command]
pub fn create_serial_session(
    port_name: String,
    baud_rate: u32,
    app_handle: AppHandle,
) -> Result<String, String> {
    let port = serialport::new(&port_name, baud_rate)
        .timeout(std::time::Duration::from_millis(50))
        .open()
        .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;

    let mut reader = port.try_clone().map_err(|e| e.to_string())?;
    let session_id = Uuid::new_v4().to_string();
    let (write_tx, write_rx) = std::sync::mpsc::channel::<Vec<u8>>();

    {
        let mut sessions = SESSIONS.lock();
        sessions.insert(
            session_id.clone(),
            TermSession::Ssh(SshTermSession {
                writer: Box::new(ChannelWriter { tx: write_tx }),
            }),
        );
    }

    let sid = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        let mut port_writer = port;

        loop {
            // Process writes
            while let Ok(data) = write_rx.try_recv() {
                if port_writer.write_all(&data).is_err() {
                    break;
                }
                port_writer.flush().ok();
            }

            // Read serial data
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit("term-output", TermOutput {
                        session_id: sid.clone(),
                        data,
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Normal for serial - no data
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(_) => break,
            }
        }

        let _ = app_handle.emit("session-event", SessionEvent {
            session_id: sid.clone(),
            event_type: "closed".to_string(),
            message: "Serial connection closed".to_string(),
        });
        SESSIONS.lock().remove(&sid);
    });

    Ok(session_id)
}

// ---------------------------------------------------------------------------
// RDP / VNC (launch external tools)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn launch_rdp(host: String, port: Option<u16>, username: Option<String>) -> Result<(), String> {
    let addr = if let Some(p) = port {
        format!("{}:{}", host, p)
    } else {
        host
    };

    let mut cmd = std::process::Command::new("mstsc");
    cmd.arg(format!("/v:{}", addr));
    if username.is_some() {
        cmd.arg("/admin");
    }
    cmd.spawn().map_err(|e| format!("Failed to launch RDP: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn launch_vnc(host: String, port: Option<u16>) -> Result<(), String> {
    let addr = if let Some(p) = port {
        format!("{}:{}", host, p)
    } else {
        format!("{}:5900", host)
    };

    // Try common VNC viewers
    let viewers = ["vncviewer", "tvnviewer", "C:\\Program Files\\TightVNC\\tvnviewer.exe"];
    for viewer in &viewers {
        if let Ok(_) = std::process::Command::new(viewer).arg(&addr).spawn() {
            return Ok(());
        }
    }

    // Fallback: try to open with system handler
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", &format!("vnc://{}", addr)])
            .spawn()
            .map_err(|e| format!("Failed to launch VNC: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    Err("No VNC viewer found. Install TightVNC or RealVNC.".to_string())
}

// ---------------------------------------------------------------------------
// FTP (simple command-based via local PTY running ftp command)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_ftp_session(
    host: String,
    port: Option<u16>,
    app_handle: AppHandle,
) -> Result<String, String> {
    // Use the system's ftp command through a PTY
    let shell = if cfg!(target_os = "windows") {
        format!("powershell.exe -NoProfile -Command \"ftp {}\"", host)
    } else {
        format!("ftp {} {}", host, port.unwrap_or(21))
    };
    crate::pty::create_local_session(Some(shell), app_handle)
}
