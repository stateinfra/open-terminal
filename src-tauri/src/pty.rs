use std::io::Read as IoRead;
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::helpers::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// Local PTY
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_local_session(shell: Option<String>, app_handle: AppHandle) -> Result<String, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell_program = shell.unwrap_or_else(|| {
        if cfg!(target_os = "windows") {
            // Try pwsh (PowerShell 7+) first, then fall back to Windows PowerShell
            if which_exists("pwsh.exe") {
                "pwsh.exe".to_string()
            } else {
                "powershell.exe".to_string()
            }
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    });

    let mut cmd = CommandBuilder::new(&shell_program);
    // Filter out sensitive environment variables
    const SENSITIVE_VARS: &[&str] = &[
        "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
        "GITHUB_TOKEN", "GH_TOKEN", "GITLAB_TOKEN",
        "DATABASE_URL", "DB_PASSWORD",
        "API_KEY", "API_SECRET", "SECRET_KEY", "PRIVATE_KEY",
        "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ];
    for (key, value) in std::env::vars() {
        let upper = key.to_uppercase();
        if SENSITIVE_VARS.iter().any(|s| upper == *s) {
            continue;
        }
        cmd.env(key, value);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("Failed to spawn '{}': {}", shell_program, e))?;

    // Drop slave to avoid blocking reads on the master
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| e.to_string())?;

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

    // Background reader thread -> emit events
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
            message: "Process exited".to_string(),
        });
    });

    Ok(session_id)
}
