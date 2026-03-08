use std::io::Write as IoWrite;
use std::thread;

use portable_pty::PtySize;
use crate::helpers::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// Unified session commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn write_session(session_id: String, data: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock();
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session '{}' not found", session_id))?;

    match session {
        TermSession::Local(local) => {
            local.writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
        }
        TermSession::Ssh(ssh) => {
            ssh.writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn resize_session(session_id: String, cols: u32, rows: u32) -> Result<(), String> {
    let sessions = SESSIONS.lock();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session '{}' not found", session_id))?;

    match session {
        TermSession::Local(local) => {
            local.master
                .resize(PtySize {
                    rows: rows as u16,
                    cols: cols as u16,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())?;
        }
        TermSession::Ssh(_) => {
            // Send resize via channel
            let senders = RESIZE_SENDERS.lock();
            if let Some(tx) = senders.get(&session_id) {
                tx.send((cols, rows)).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn close_session(session_id: String) -> Result<(), String> {
    RESIZE_SENDERS.lock().remove(&session_id);

    let mut sessions = SESSIONS.lock();
    if let Some(session) = sessions.remove(&session_id) {
        match session {
            TermSession::Local(mut local) => {
                local.child.kill().ok();
                local.child.wait().ok();
            }
            TermSession::Ssh(ssh) => {
                drop(ssh);
            }
        }
        Ok(())
    } else {
        Ok(()) // already cleaned up
    }
}

// ---------------------------------------------------------------------------
// Session Logging
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_session_log(session_id: String, file_path: String) -> Result<(), String> {
    // Check if already logging
    {
        let logs = SESSION_LOGS.lock();
        if logs.contains_key(&session_id) {
            return Err(format!("Session '{}' is already being logged", session_id));
        }
    }

    // Validate log file path — must be under user's home or documents directory
    let fp = std::path::PathBuf::from(&file_path);
    if let Some(home) = dirs::home_dir() {
        let canonical_parent = fp.parent()
            .and_then(|p| std::fs::canonicalize(p).ok());
        let canonical_home = std::fs::canonicalize(&home).ok();
        if let (Some(parent), Some(home_c)) = (canonical_parent, canonical_home) {
            if !parent.starts_with(&home_c) {
                return Err("Log file path must be under your home directory".to_string());
            }
        }
    }

    let (tx, rx) = std::sync::mpsc::channel::<String>();

    // Spawn writer thread
    let fp = file_path.clone();
    thread::spawn(move || {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&fp);

        match file {
            Ok(mut f) => {
                while let Ok(data) = rx.recv() {
                    let _ = f.write_all(data.as_bytes());
                    let _ = f.flush();
                }
            }
            Err(e) => {
                eprintln!("Failed to open log file '{}': {}", fp, e);
            }
        }
    });

    SESSION_LOGS.lock().insert(session_id, tx);
    Ok(())
}

#[tauri::command]
pub fn stop_session_log(session_id: String) -> Result<(), String> {
    // Remove sender, which will cause the receiver thread to end when dropped
    let removed = SESSION_LOGS.lock().remove(&session_id);
    if removed.is_none() {
        return Err(format!("No active log for session '{}'", session_id));
    }
    Ok(())
}

#[tauri::command]
pub fn log_session_data(session_id: String, data: String) -> Result<(), String> {
    let logs = SESSION_LOGS.lock();
    if let Some(tx) = logs.get(&session_id) {
        tx.send(data).map_err(|e| format!("Failed to send log data: {}", e))?;
    }
    // Silently ignore if not logging - this is expected behavior
    Ok(())
}

// ---------------------------------------------------------------------------
// Session Import/Export
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn export_sessions(file_path: String) -> Result<(), String> {
    let src = sessions_file_path()?;
    if !src.exists() {
        return Err("No sessions file found to export".to_string());
    }
    std::fs::copy(&src, &file_path).map_err(|e| format!("Failed to export sessions: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn import_sessions(file_path: String) -> Result<Vec<SavedSession>, String> {
    let import_data = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read import file: {}", e))?;
    let import_sessions: Vec<SavedSession> =
        serde_json::from_str(&import_data).map_err(|e| format!("Invalid session file format: {}", e))?;

    let path = sessions_file_path()?;
    let mut existing = if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Vec<SavedSession>>(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Merge: update existing by name, add new ones
    for imported in &import_sessions {
        if let Some(existing_session) = existing.iter_mut().find(|s| s.name == imported.name) {
            *existing_session = imported.clone();
        } else {
            existing.push(imported.clone());
        }
    }

    let json = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(existing)
}

// ---------------------------------------------------------------------------
// Session management commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn save_session(session: SavedSession) -> Result<(), String> {
    let path = sessions_file_path()?;

    let mut sessions = if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Vec<SavedSession>>(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    if let Some(existing) = sessions.iter_mut().find(|s| s.name == session.name) {
        *existing = session;
    } else {
        sessions.push(session);
    }

    let json = serde_json::to_string_pretty(&sessions).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_sessions() -> Result<Vec<SavedSession>, String> {
    let path = sessions_file_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let sessions: Vec<SavedSession> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(sessions)
}

#[tauri::command]
pub fn delete_session(name: String) -> Result<(), String> {
    let path = sessions_file_path()?;
    if !path.exists() {
        return Ok(());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut sessions: Vec<SavedSession> = serde_json::from_str(&data).unwrap_or_default();
    sessions.retain(|s| s.name != name);
    let json = serde_json::to_string_pretty(&sessions).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
