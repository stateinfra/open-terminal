use std::io::{Read as IoRead, Write as IoWrite};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use serde::Serialize;
use ssh2::Session as Ssh2Session;
use uuid::Uuid;

use crate::helpers::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// SSH Tunnel (Local Port Forwarding)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_ssh_tunnel(
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<String, String> {
    // Establish SSH connection
    let tcp = TcpStream::connect(format!("{}:{}", host, port))
        .map_err(|e| format!("SSH connection failed: {}", e))?;

    let mut sess = Ssh2Session::new().map_err(|e| e.to_string())?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("SSH handshake failed: {}", e))?;

    ssh_authenticate(&sess, &username, password.as_deref(), key_path.as_deref())?;

    let tunnel_id = Uuid::new_v4().to_string();
    let shutdown_flag = Arc::new(AtomicBool::new(false));

    // Store tunnel info
    {
        let mut tunnels = TUNNELS.lock();
        tunnels.insert(
            tunnel_id.clone(),
            TunnelInfo {
                id: tunnel_id.clone(),
                local_port,
                remote_host: remote_host.clone(),
                remote_port,
                status: "active".to_string(),
            },
        );
    }
    {
        let mut shutdowns = TUNNEL_SHUTDOWN.lock();
        shutdowns.insert(tunnel_id.clone(), shutdown_flag.clone());
    }

    let tid = tunnel_id.clone();
    let rhost = remote_host.clone();
    let rport = remote_port;

    thread::spawn(move || {
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", local_port)) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("Tunnel bind failed: {}", e);
                TUNNELS.lock().remove(&tid);
                TUNNEL_SHUTDOWN.lock().remove(&tid);
                return;
            }
        };

        // Set non-blocking so we can check shutdown flag
        listener.set_nonblocking(true).ok();

        while !shutdown_flag.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((mut local_stream, _)) => {
                    // Open SSH direct-tcpip channel
                    let channel = match sess.channel_direct_tcpip(&rhost, rport, None) {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("Tunnel channel failed: {}", e);
                            continue;
                        }
                    };

                    let shutdown = shutdown_flag.clone();
                    // Copy data bidirectionally
                    let _local_read = match local_stream.try_clone() {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    let channel_stream = channel.stream(0);
                    let _channel_write = match sess.channel_direct_tcpip(&rhost, rport, None) {
                        // We need a separate approach: use the same channel for r/w
                        // ssh2 channel implements Read and Write on stream(0)
                        _ => {
                            // Actually reuse the original channel - let's restructure
                            drop(channel_stream);
                            // We'll handle the bidirectional copy in two threads
                            // But ssh2 channels aren't Send. Instead, do blocking copy in one thread.
                            let _ = local_stream.set_nonblocking(false);
                            sess.set_blocking(true);

                            let mut chan = channel;
                            let mut local_w = match local_stream.try_clone() {
                                Ok(s) => s,
                                Err(_) => continue,
                            };

                            // Bidirectional copy in a single thread using non-blocking
                            local_stream.set_nonblocking(true).ok();
                            sess.set_blocking(false);

                            let mut local_buf = [0u8; 8192];
                            let mut chan_buf = [0u8; 8192];

                            loop {
                                if shutdown.load(Ordering::Relaxed) {
                                    break;
                                }

                                // Local -> SSH channel
                                match local_stream.read(&mut local_buf) {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        sess.set_blocking(true);
                                        if chan.write_all(&local_buf[..n]).is_err() {
                                            break;
                                        }
                                        chan.flush().ok();
                                        sess.set_blocking(false);
                                    }
                                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                                    Err(_) => break,
                                }

                                // SSH channel -> Local
                                match chan.read(&mut chan_buf) {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        if local_w.write_all(&chan_buf[..n]).is_err() {
                                            break;
                                        }
                                        local_w.flush().ok();
                                    }
                                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                                    Err(_) => break,
                                }

                                thread::sleep(std::time::Duration::from_millis(5));
                            }

                            continue;
                        }
                    };
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(_) => break,
            }
        }

        // Cleanup
        let _ = sess.disconnect(None, "tunnel closed", None);
        if let Some(info) = TUNNELS.lock().get_mut(&tid) {
            info.status = "closed".to_string();
        }
        TUNNELS.lock().remove(&tid);
        TUNNEL_SHUTDOWN.lock().remove(&tid);
    });

    Ok(tunnel_id)
}

#[tauri::command]
pub fn list_tunnels() -> Result<Vec<TunnelInfo>, String> {
    let tunnels = TUNNELS.lock();
    Ok(tunnels.values().cloned().collect())
}

#[tauri::command]
pub fn close_tunnel(tunnel_id: String) -> Result<(), String> {
    // Signal shutdown
    if let Some(flag) = TUNNEL_SHUTDOWN.lock().get(&tunnel_id) {
        flag.store(true, Ordering::Relaxed);
    }
    // Remove from maps (the thread will also clean up)
    TUNNELS.lock().remove(&tunnel_id);
    TUNNEL_SHUTDOWN.lock().remove(&tunnel_id);
    Ok(())
}

// ---------------------------------------------------------------------------
// Port Scanner
// ---------------------------------------------------------------------------

fn get_service_name(port: u16) -> String {
    match port {
        20 => "FTP-DATA".to_string(),
        21 => "FTP".to_string(),
        22 => "SSH".to_string(),
        23 => "Telnet".to_string(),
        25 => "SMTP".to_string(),
        53 => "DNS".to_string(),
        80 => "HTTP".to_string(),
        110 => "POP3".to_string(),
        111 => "RPCBind".to_string(),
        135 => "MSRPC".to_string(),
        139 => "NetBIOS".to_string(),
        143 => "IMAP".to_string(),
        443 => "HTTPS".to_string(),
        445 => "SMB".to_string(),
        993 => "IMAPS".to_string(),
        995 => "POP3S".to_string(),
        1433 => "MSSQL".to_string(),
        1521 => "Oracle".to_string(),
        3306 => "MySQL".to_string(),
        3389 => "RDP".to_string(),
        5432 => "PostgreSQL".to_string(),
        5900 => "VNC".to_string(),
        6379 => "Redis".to_string(),
        8080 => "HTTP-Alt".to_string(),
        8443 => "HTTPS-Alt".to_string(),
        27017 => "MongoDB".to_string(),
        _ => "Unknown".to_string(),
    }
}

#[tauri::command]
pub fn scan_ports(host: String, start_port: u16, end_port: u16) -> Result<Vec<PortScanResult>, String> {
    if end_port < start_port {
        return Err("end_port must be >= start_port".to_string());
    }
    if (end_port - start_port) as u32 + 1 > 1024 {
        return Err("Port range too large. Maximum 1024 ports at a time.".to_string());
    }

    let timeout = std::time::Duration::from_millis(500);
    let mut results = Vec::new();

    for port in start_port..=end_port {
        let addr = format!("{}:{}", host, port);
        if let Ok(addr) = addr.parse::<std::net::SocketAddr>() {
            if TcpStream::connect_timeout(&addr, timeout).is_ok() {
                results.push(PortScanResult {
                    port,
                    open: true,
                    service: get_service_name(port),
                });
            }
        } else {
            // Try DNS resolution
            use std::net::ToSocketAddrs;
            if let Ok(mut addrs) = addr.to_socket_addrs() {
                if let Some(resolved) = addrs.next() {
                    if TcpStream::connect_timeout(&resolved, timeout).is_ok() {
                        results.push(PortScanResult {
                            port,
                            open: true,
                            service: get_service_name(port),
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// Wake-on-LAN
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn send_wol(mac_address: String) -> Result<(), String> {
    // Parse MAC address (AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF)
    let mac_str = mac_address.replace('-', ":");
    let parts: Vec<&str> = mac_str.split(':').collect();
    if parts.len() != 6 {
        return Err("Invalid MAC address format. Use AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF".to_string());
    }

    let mut mac_bytes = [0u8; 6];
    for (i, part) in parts.iter().enumerate() {
        mac_bytes[i] = u8::from_str_radix(part, 16)
            .map_err(|_| format!("Invalid hex byte in MAC address: {}", part))?;
    }

    // Build magic packet: 6x 0xFF + 16x MAC
    let mut packet = Vec::with_capacity(102);
    for _ in 0..6 {
        packet.push(0xFF);
    }
    for _ in 0..16 {
        packet.extend_from_slice(&mac_bytes);
    }

    // Send via UDP broadcast
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("Failed to bind UDP socket: {}", e))?;
    socket.set_broadcast(true).map_err(|e| format!("Failed to enable broadcast: {}", e))?;
    socket.send_to(&packet, "255.255.255.255:9")
        .map_err(|e| format!("Failed to send WOL packet: {}", e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Network Tools
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn run_ping(host: String, count: Option<u32>) -> Result<String, String> {
    let count = count.unwrap_or(4);

    let output = if cfg!(target_os = "windows") {
        std::process::Command::new("ping")
            .args(["-n", &count.to_string(), &host])
            .output()
            .map_err(|e| format!("Failed to run ping: {}", e))?
    } else {
        std::process::Command::new("ping")
            .args(["-c", &count.to_string(), &host])
            .output()
            .map_err(|e| format!("Failed to run ping: {}", e))?
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stderr.is_empty() && stdout.is_empty() {
        Err(stderr)
    } else {
        Ok(format!("{}{}", stdout, stderr))
    }
}

#[tauri::command]
pub fn run_traceroute(host: String) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        std::process::Command::new("tracert")
            .arg(&host)
            .output()
            .map_err(|e| format!("Failed to run tracert: {}", e))?
    } else {
        std::process::Command::new("traceroute")
            .arg(&host)
            .output()
            .map_err(|e| format!("Failed to run traceroute: {}", e))?
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stderr.is_empty() && stdout.is_empty() {
        Err(stderr)
    } else {
        Ok(format!("{}{}", stdout, stderr))
    }
}

#[tauri::command]
pub fn run_nslookup(host: String) -> Result<String, String> {
    let output = std::process::Command::new("nslookup")
        .arg(&host)
        .output()
        .map_err(|e| format!("Failed to run nslookup: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stderr.is_empty() && stdout.is_empty() {
        Err(stderr)
    } else {
        Ok(format!("{}{}", stdout, stderr))
    }
}

// ---------------------------------------------------------------------------
// Built-in Local HTTP Server
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_http_server(root_path: String, port: u16) -> Result<String, String> {
    let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
        .map_err(|e| format!("Failed to bind port {}: {}", port, e))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let server_id = Uuid::new_v4().to_string();
    let running = Arc::new(AtomicBool::new(true));
    HTTP_SERVERS.lock().insert(server_id.clone(), running.clone());

    let root = root_path.clone();
    thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let root = root.clone();
                    thread::spawn(move || {
                        let mut request = [0u8; 4096];
                        let n = stream.read(&mut request).unwrap_or(0);
                        let req_str = String::from_utf8_lossy(&request[..n]);
                        let path = req_str.lines().next()
                            .and_then(|line| line.split_whitespace().nth(1))
                            .unwrap_or("/");

                        let file_path = if path == "/" {
                            // List directory
                            let entries = std::fs::read_dir(&root).ok();
                            let mut html = String::from("<html><head><meta charset='utf-8'><title>File Server</title><style>body{font-family:monospace;background:#1e1e2e;color:#cdd6f4;padding:20px}a{color:#89b4fa;text-decoration:none}a:hover{text-decoration:underline}li{padding:4px 0}</style></head><body><h2>Index of /</h2><ul>");
                            if let Some(entries) = entries {
                                for entry in entries.flatten() {
                                    let name = entry.file_name().to_string_lossy().to_string();
                                    let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                                    let display = if is_dir { format!("{}/", name) } else { name.clone() };
                                    html.push_str(&format!("<li><a href='/{}'>{}</a></li>", name, display));
                                }
                            }
                            html.push_str("</ul></body></html>");
                            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}", html.len(), html);
                            let _ = stream.write_all(response.as_bytes());
                            return;
                        } else {
                            let decoded = path.trim_start_matches('/');
                            std::path::PathBuf::from(&root).join(decoded)
                        };

                        if file_path.exists() && file_path.is_file() {
                            if let Ok(content) = std::fs::read(&file_path) {
                                let mime = if file_path.extension().and_then(|e| e.to_str()) == Some("html") { "text/html" }
                                    else if file_path.extension().and_then(|e| e.to_str()) == Some("json") { "application/json" }
                                    else if file_path.extension().and_then(|e| e.to_str()) == Some("js") { "application/javascript" }
                                    else if file_path.extension().and_then(|e| e.to_str()) == Some("css") { "text/css" }
                                    else { "application/octet-stream" };
                                let header = format!("HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\n\r\n", mime, content.len());
                                let _ = stream.write_all(header.as_bytes());
                                let _ = stream.write_all(&content);
                            }
                        } else {
                            let body = "404 Not Found";
                            let response = format!("HTTP/1.1 404 Not Found\r\nContent-Length: {}\r\n\r\n{}", body.len(), body);
                            let _ = stream.write_all(response.as_bytes());
                        }
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(_) => break,
            }
        }
    });

    Ok(server_id)
}

#[tauri::command]
pub fn stop_http_server(server_id: String) -> Result<(), String> {
    if let Some(running) = HTTP_SERVERS.lock().remove(&server_id) {
        running.store(false, Ordering::Relaxed);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Network Connections (netstat)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct NetworkConnection {
    protocol: String,
    local_addr: String,
    remote_addr: String,
    state: String,
    pid: String,
}

#[tauri::command]
pub fn get_network_connections() -> Result<Vec<NetworkConnection>, String> {
    let output = if cfg!(target_os = "windows") {
        std::process::Command::new("netstat")
            .args(["-ano"])
            .output()
            .map_err(|e| e.to_string())?
    } else {
        std::process::Command::new("netstat")
            .args(["-tunap"])
            .output()
            .map_err(|e| e.to_string())?
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut connections = Vec::new();

    for line in stdout.lines().skip(4) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            connections.push(NetworkConnection {
                protocol: parts[0].to_string(),
                local_addr: parts[1].to_string(),
                remote_addr: parts[2].to_string(),
                state: if parts.len() > 3 { parts[3].to_string() } else { String::new() },
                pid: if parts.len() > 4 { parts[parts.len() - 1].to_string() } else { String::new() },
            });
        }
    }

    Ok(connections)
}
