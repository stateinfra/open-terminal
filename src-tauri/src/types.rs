use std::collections::HashMap;
use std::io::Write as IoWrite;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use parking_lot::Mutex;
use portable_pty::{Child, MasterPty};
use serde::{Deserialize, Serialize};
use ssh2::Session as Ssh2Session;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SavedSession {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub session_type: String,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub auth_type: Option<String>,
    #[serde(default)]
    pub identity_file: Option<String>,
    #[serde(default)]
    pub shell: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub baud_rate: Option<u32>,
    #[serde(default)]
    pub serial_port: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct TermOutput {
    pub session_id: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
pub struct SessionEvent {
    pub session_id: String,
    pub event_type: String,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct TunnelInfo {
    pub id: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub status: String,
}

#[derive(Serialize, Clone)]
pub struct PortScanResult {
    pub port: u16,
    pub open: bool,
    pub service: String,
}

// ---------------------------------------------------------------------------
// Session variants
// ---------------------------------------------------------------------------

pub struct LocalSession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn IoWrite + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

pub struct SshTermSession {
    pub writer: Box<dyn IoWrite + Send>,
}

pub enum TermSession {
    Local(LocalSession),
    Ssh(SshTermSession),
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

lazy_static::lazy_static! {
    pub static ref SESSIONS: Arc<Mutex<HashMap<String, TermSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
    pub static ref TUNNELS: Arc<Mutex<HashMap<String, TunnelInfo>>> =
        Arc::new(Mutex::new(HashMap::new()));
    pub static ref TUNNEL_SHUTDOWN: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    pub static ref SESSION_LOGS: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<String>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    pub static ref SFTP_SESSIONS: Arc<Mutex<HashMap<String, Ssh2Session>>> =
        Arc::new(Mutex::new(HashMap::new()));
    pub static ref RESIZE_SENDERS: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<(u32, u32)>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    pub static ref HTTP_SERVERS: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> =
        Arc::new(Mutex::new(HashMap::new()));
}
