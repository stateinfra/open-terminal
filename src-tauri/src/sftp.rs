use std::io::{Read as IoRead, Write as IoWrite};
use std::net::TcpStream;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ssh2::Session as Ssh2Session;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::helpers::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// SFTP commands (via separate SSH connection)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn sftp_connect(
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
) -> Result<String, String> {
    let tcp = TcpStream::connect(format!("{}:{}", host, port))
        .map_err(|e| format!("SFTP connection failed: {}", e))?;

    let mut sess = Ssh2Session::new().map_err(|e| e.to_string())?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| e.to_string())?;

    ssh_authenticate(&sess, &username, password.as_deref(), key_path.as_deref())?;

    let sftp_id = Uuid::new_v4().to_string();
    SFTP_SESSIONS.lock().insert(sftp_id.clone(), sess);
    Ok(sftp_id)
}

#[tauri::command]
pub fn sftp_list(sftp_id: String, path: String) -> Result<Vec<FileEntry>, String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions
        .get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    let entries = sftp
        .readdir(std::path::Path::new(&path))
        .map_err(|e| e.to_string())?;

    let mut result: Vec<FileEntry> = entries
        .into_iter()
        .filter_map(|(pathbuf, stat)| {
            let name = pathbuf
                .file_name()
                .map(|n| n.to_string_lossy().to_string())?;
            if name == "." || name == ".." {
                return None;
            }
            let full_path = pathbuf.to_string_lossy().to_string();
            let is_dir = stat.is_dir();
            let size = stat.size.unwrap_or(0);
            let modified = stat.mtime.map(|t| {
                let dt = chrono::DateTime::from_timestamp(t as i64, 0);
                dt.map(|d| d.format("%Y-%m-%d %H:%M").to_string())
                    .unwrap_or_else(|| t.to_string())
            });

            Some(FileEntry {
                name,
                path: full_path,
                is_dir,
                size,
                modified,
            })
        })
        .collect();

    // Sort: dirs first, then by name
    result.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

#[tauri::command]
pub fn sftp_read_file(sftp_id: String, path: String) -> Result<Vec<u8>, String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions
        .get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    let mut file = sftp.open(std::path::Path::new(&path)).map_err(|e| e.to_string())?;

    let mut contents = Vec::new();
    file.read_to_end(&mut contents).map_err(|e| e.to_string())?;
    Ok(contents)
}

#[tauri::command]
pub fn sftp_write_file(sftp_id: String, path: String, data: Vec<u8>) -> Result<(), String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions
        .get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    let mut file = sftp.create(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    file.write_all(&data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn sftp_delete(sftp_id: String, path: String, is_dir: bool) -> Result<(), String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions
        .get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    if is_dir {
        sftp.rmdir(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    } else {
        sftp.unlink(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn sftp_mkdir(sftp_id: String, path: String) -> Result<(), String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions
        .get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    sftp.mkdir(std::path::Path::new(&path), 0o755).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn sftp_rename(sftp_id: String, old_path: String, new_path: String) -> Result<(), String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions
        .get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    sftp.rename(
        std::path::Path::new(&old_path),
        std::path::Path::new(&new_path),
        None,
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn sftp_chmod(sftp_id: String, path: String, mode: u32) -> Result<(), String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions
        .get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;
    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    let mut stat = sftp.stat(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    stat.perm = Some(mode);
    sftp.setstat(std::path::Path::new(&path), stat).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn sftp_disconnect(sftp_id: String) -> Result<(), String> {
    SFTP_SESSIONS.lock().remove(&sftp_id);
    Ok(())
}

// ---------------------------------------------------------------------------
// SFTP Transfer with Progress
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
pub struct SftpProgress {
    sftp_id: String,
    path: String,
    transferred: u64,
    total: u64,
    direction: String,
}

#[tauri::command]
pub fn sftp_download_with_progress(sftp_id: String, path: String, app_handle: AppHandle) -> Result<Vec<u8>, String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions.get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    let stat = sftp.stat(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    let total = stat.size.unwrap_or(0);

    let mut file = sftp.open(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    let mut contents = Vec::with_capacity(total as usize);
    let mut buf = [0u8; 32768];
    let mut transferred: u64 = 0;

    loop {
        match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                contents.extend_from_slice(&buf[..n]);
                transferred += n as u64;
                let _ = app_handle.emit("sftp-progress", SftpProgress {
                    sftp_id: sftp_id.clone(), path: path.clone(),
                    transferred, total, direction: "download".to_string(),
                });
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(contents)
}

#[tauri::command]
pub fn sftp_upload_with_progress(sftp_id: String, path: String, data: Vec<u8>, app_handle: AppHandle) -> Result<(), String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions.get(&sftp_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_id))?;

    let sftp = sess.sftp().map_err(|e| e.to_string())?;
    let mut file = sftp.create(std::path::Path::new(&path)).map_err(|e| e.to_string())?;

    let total = data.len() as u64;
    let chunk_size = 32768;
    let mut transferred: u64 = 0;

    for chunk in data.chunks(chunk_size) {
        file.write_all(chunk).map_err(|e| e.to_string())?;
        transferred += chunk.len() as u64;
        let _ = app_handle.emit("sftp-progress", SftpProgress {
            sftp_id: sftp_id.clone(), path: path.clone(),
            transferred, total, direction: "upload".to_string(),
        });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// SFTP Bookmarks
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct SftpBookmark {
    id: String,
    sftp_id: String,
    name: String,
    path: String,
}

fn sftp_bookmarks_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Config dir not found")?;
    let app_dir = config_dir.join("open-terminal");
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("sftp_bookmarks.json"))
}

#[tauri::command]
pub fn save_sftp_bookmark(name: String, path: String) -> Result<(), String> {
    let file_path = sftp_bookmarks_path()?;
    let mut bookmarks: Vec<SftpBookmark> = if file_path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?).unwrap_or_default()
    } else { Vec::new() };

    bookmarks.push(SftpBookmark {
        id: Uuid::new_v4().to_string(), sftp_id: String::new(), name, path,
    });
    std::fs::write(&file_path, serde_json::to_string_pretty(&bookmarks).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_sftp_bookmarks() -> Result<Vec<SftpBookmark>, String> {
    let path = sftp_bookmarks_path()?;
    if !path.exists() { return Ok(Vec::new()); }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&data).unwrap_or_default())
}

#[tauri::command]
pub fn delete_sftp_bookmark(id: String) -> Result<(), String> {
    let path = sftp_bookmarks_path()?;
    if !path.exists() { return Ok(()); }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut bookmarks: Vec<SftpBookmark> = serde_json::from_str(&data).unwrap_or_default();
    bookmarks.retain(|b| b.id != id);
    std::fs::write(&path, serde_json::to_string_pretty(&bookmarks).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}
