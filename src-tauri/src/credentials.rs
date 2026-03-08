use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::helpers::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// SSH Config Parser
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct SshConfigEntry {
    host: String,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    proxy_jump: Option<String>,
    proxy_command: Option<String>,
}

#[tauri::command]
pub fn parse_ssh_config() -> Result<Vec<SshConfigEntry>, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let config_path = home.join(".ssh").join("config");
    if !config_path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read SSH config: {}", e))?;

    let mut entries = Vec::new();
    let mut current: Option<SshConfigEntry> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = line.splitn(2, |c: char| c.is_whitespace() || c == '=').collect();
        if parts.len() < 2 {
            continue;
        }
        let key = parts[0].trim().to_lowercase();
        let value = parts[1].trim().to_string();

        if key == "host" {
            if let Some(entry) = current.take() {
                if entry.host != "*" {
                    entries.push(entry);
                }
            }
            current = Some(SshConfigEntry {
                host: value,
                hostname: None,
                user: None,
                port: None,
                identity_file: None,
                proxy_jump: None,
                proxy_command: None,
            });
        } else if let Some(ref mut entry) = current {
            match key.as_str() {
                "hostname" => entry.hostname = Some(value),
                "user" => entry.user = Some(value),
                "port" => entry.port = value.parse().ok(),
                "identityfile" => {
                    let expanded = if value.starts_with("~/") {
                        home.join(&value[2..]).to_string_lossy().to_string()
                    } else {
                        value
                    };
                    entry.identity_file = Some(expanded);
                }
                "proxyjump" => entry.proxy_jump = Some(value),
                "proxycommand" => entry.proxy_command = Some(value),
                _ => {}
            }
        }
    }
    if let Some(entry) = current {
        if entry.host != "*" {
            entries.push(entry);
        }
    }

    Ok(entries)
}

#[tauri::command]
pub fn import_ssh_config() -> Result<Vec<SavedSession>, String> {
    let config_entries = parse_ssh_config()?;
    let path = sessions_file_path()?;
    let mut existing = if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Vec<SavedSession>>(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut _imported_count = 0;
    for entry in config_entries {
        let name = format!("SSH: {}", entry.host);
        if existing.iter().any(|s| s.name == name) {
            continue;
        }
        existing.push(SavedSession {
            name,
            session_type: "ssh".to_string(),
            host: entry.hostname.or(Some(entry.host)),
            port: entry.port,
            username: entry.user,
            auth_type: if entry.identity_file.is_some() { Some("key".to_string()) } else { Some("password".to_string()) },
            identity_file: entry.identity_file,
            shell: None,
            group: Some("SSH Config".to_string()),
            tags: None,
            color: None,
            baud_rate: None,
            serial_port: None,
        });
        _imported_count += 1;
    }

    let json = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(existing)
}

// ---------------------------------------------------------------------------
// SSH Key Generator
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct SshKeyResult {
    public_key_path: String,
    private_key_path: String,
    public_key_content: String,
}

#[tauri::command]
pub fn generate_ssh_key(
    key_type: String,
    bits: Option<u32>,
    comment: Option<String>,
    passphrase: Option<String>,
    filename: Option<String>,
) -> Result<SshKeyResult, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let ssh_dir = home.join(".ssh");
    std::fs::create_dir_all(&ssh_dir).map_err(|e| e.to_string())?;

    let key_name = filename.unwrap_or_else(|| format!("id_{}", key_type));
    let key_path = ssh_dir.join(&key_name);

    if key_path.exists() {
        return Err(format!("Key file already exists: {}", key_path.display()));
    }

    let mut args = vec![
        "-t".to_string(), key_type.clone(),
        "-f".to_string(), key_path.to_string_lossy().to_string(),
        "-N".to_string(), passphrase.unwrap_or_default(),
    ];

    if let Some(b) = bits {
        if key_type == "rsa" {
            args.push("-b".to_string());
            args.push(b.to_string());
        }
    }

    if let Some(c) = comment {
        args.push("-C".to_string());
        args.push(c);
    }

    let output = std::process::Command::new("ssh-keygen")
        .args(&args)
        .output()
        .map_err(|e| format!("ssh-keygen not found: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ssh-keygen failed: {}", stderr));
    }

    let pub_path = format!("{}.pub", key_path.display());
    let pub_content = std::fs::read_to_string(&pub_path)
        .map_err(|e| format!("Failed to read public key: {}", e))?;

    Ok(SshKeyResult {
        public_key_path: pub_path,
        private_key_path: key_path.to_string_lossy().to_string(),
        public_key_content: pub_content.trim().to_string(),
    })
}

#[tauri::command]
pub fn list_ssh_keys() -> Result<Vec<String>, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let ssh_dir = home.join(".ssh");
    if !ssh_dir.exists() {
        return Ok(Vec::new());
    }

    let mut keys = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&ssh_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".pub") {
                keys.push(entry.path().to_string_lossy().to_string());
            }
        }
    }
    Ok(keys)
}

// ---------------------------------------------------------------------------
// Password Manager (encrypted credential store)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct CredentialEntry {
    id: String,
    label: String,
    username: String,
    password: String, // base64 encoded (simple obfuscation, not true encryption)
    host: Option<String>,
    notes: Option<String>,
}

fn credentials_file_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join("open-terminal");
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("credentials.json"))
}

#[tauri::command]
pub fn save_credential(label: String, username: String, password: String, host: Option<String>, notes: Option<String>) -> Result<(), String> {
    let path = credentials_file_path()?;
    let mut creds = if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Vec<CredentialEntry>>(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    let id = Uuid::new_v4().to_string();
    creds.push(CredentialEntry {
        id,
        label,
        username,
        password: aes_encrypt(&password)?,
        host,
        notes,
    });

    let json = serde_json::to_string_pretty(&creds).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_credentials() -> Result<Vec<CredentialEntry>, String> {
    let path = credentials_file_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut creds: Vec<CredentialEntry> = serde_json::from_str(&data).unwrap_or_default();
    // Decrypt passwords for display
    for c in &mut creds {
        match aes_decrypt(&c.password) {
            Ok(plain) => c.password = plain,
            Err(e) if e.starts_with("LEGACY:") => {
                // Legacy XOR-encoded password — migrate
                c.password = legacy_xor_decode(&e[7..]);
            }
            Err(_) => c.password = String::new(),
        }
    }
    Ok(creds)
}

#[tauri::command]
pub fn delete_credential(id: String) -> Result<(), String> {
    let path = credentials_file_path()?;
    if !path.exists() {
        return Ok(());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut creds: Vec<CredentialEntry> = serde_json::from_str(&data).unwrap_or_default();
    creds.retain(|c| c.id != id);
    let json = serde_json::to_string_pretty(&creds).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Macro Recording
// ---------------------------------------------------------------------------

fn macros_file_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join("open-terminal");
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("macros.json"))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MacroEntry {
    id: String,
    name: String,
    keystrokes: Vec<MacroKeystroke>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MacroKeystroke {
    data: String,
    delay_ms: u64,
}

#[tauri::command]
pub fn save_macro(name: String, keystrokes: Vec<MacroKeystroke>) -> Result<String, String> {
    let path = macros_file_path()?;
    let mut macros = if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Vec<MacroEntry>>(&data).unwrap_or_default()
    } else {
        Vec::new()
    };
    let id = Uuid::new_v4().to_string();
    macros.push(MacroEntry { id: id.clone(), name, keystrokes });
    let json = serde_json::to_string_pretty(&macros).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn load_macros() -> Result<Vec<MacroEntry>, String> {
    let path = macros_file_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let macros: Vec<MacroEntry> = serde_json::from_str(&data).unwrap_or_default();
    Ok(macros)
}

#[tauri::command]
pub fn delete_macro(id: String) -> Result<(), String> {
    let path = macros_file_path()?;
    if !path.exists() { return Ok(()); }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut macros: Vec<MacroEntry> = serde_json::from_str(&data).unwrap_or_default();
    macros.retain(|m| m.id != id);
    let json = serde_json::to_string_pretty(&macros).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Public Key Distribution (ssh-copy-id)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn distribute_public_key(host: String, port: u16, username: String, password: String, key_path: Option<String>) -> Result<String, String> {
    let key_file = key_path.unwrap_or_else(|| {
        let home = dirs::home_dir().unwrap_or_default();
        home.join(".ssh").join("id_ed25519.pub").to_string_lossy().to_string()
    });
    // Ensure it's a .pub file
    let pub_file = if key_file.ends_with(".pub") { key_file.clone() } else { format!("{}.pub", key_file) };
    let pub_key = std::fs::read_to_string(&pub_file).map_err(|e| format!("Cannot read public key {}: {}", pub_file, e))?;
    let pub_key = pub_key.trim().to_string();

    // Connect via SSH and append key to authorized_keys
    let tcp = std::net::TcpStream::connect(format!("{}:{}", host, port)).map_err(|e| e.to_string())?;
    let mut sess = ssh2::Session::new().map_err(|e| e.to_string())?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| e.to_string())?;
    sess.userauth_password(&username, &password).map_err(|e| e.to_string())?;

    let cmd = format!(
        "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '{}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys",
        pub_key
    );
    let mut channel = sess.channel_session().map_err(|e| e.to_string())?;
    channel.exec(&cmd).map_err(|e| e.to_string())?;
    let mut output = String::new();
    std::io::Read::read_to_string(&mut channel, &mut output).map_err(|e| e.to_string())?;
    channel.wait_close().map_err(|e| e.to_string())?;

    let exit = channel.exit_status().unwrap_or(-1);
    if exit == 0 {
        Ok(format!("Public key deployed to {}@{}", username, host))
    } else {
        Err(format!("Failed with exit code {}: {}", exit, output))
    }
}

// ---------------------------------------------------------------------------
// Environment Variable Presets
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvPreset {
    id: String,
    name: String,
    variables: std::collections::HashMap<String, String>,
}

fn env_presets_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join("open-terminal");
    let _ = std::fs::create_dir_all(&app_dir);
    Ok(app_dir.join("env_presets.json"))
}

#[tauri::command]
pub fn save_env_preset(name: String, variables: std::collections::HashMap<String, String>) -> Result<String, String> {
    let path = env_presets_path()?;
    let mut presets: Vec<EnvPreset> = if path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default()
    } else {
        Vec::new()
    };
    let id = uuid::Uuid::new_v4().to_string();
    presets.push(EnvPreset { id: id.clone(), name, variables });
    let json = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn load_env_presets() -> Result<Vec<EnvPreset>, String> {
    let path = env_presets_path()?;
    if !path.exists() { return Ok(Vec::new()); }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&data).unwrap_or_default())
}

#[tauri::command]
pub fn delete_env_preset(id: String) -> Result<(), String> {
    let path = env_presets_path()?;
    if !path.exists() { return Ok(()); }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut presets: Vec<EnvPreset> = serde_json::from_str(&data).unwrap_or_default();
    presets.retain(|p| p.id != id);
    let json = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Connection Templates
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct ConnectionTemplate {
    id: String,
    name: String,
    session_type: String,
    host_pattern: Option<String>,
    port: Option<u16>,
    username_pattern: Option<String>,
    auth_type: Option<String>,
    identity_file: Option<String>,
    group: Option<String>,
    variables: Vec<String>,
}

fn templates_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join("open-terminal");
    let _ = std::fs::create_dir_all(&app_dir);
    Ok(app_dir.join("templates.json"))
}

#[tauri::command]
pub fn save_template(template: ConnectionTemplate) -> Result<String, String> {
    let path = templates_path()?;
    let mut templates: Vec<ConnectionTemplate> = if path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default()
    } else {
        Vec::new()
    };
    let id = if template.id.is_empty() { uuid::Uuid::new_v4().to_string() } else { template.id.clone() };
    templates.retain(|t| t.id != id);
    templates.push(ConnectionTemplate { id: id.clone(), ..template });
    let json = serde_json::to_string_pretty(&templates).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn load_templates() -> Result<Vec<ConnectionTemplate>, String> {
    let path = templates_path()?;
    if !path.exists() { return Ok(Vec::new()); }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&data).unwrap_or_default())
}

#[tauri::command]
pub fn delete_template(id: String) -> Result<(), String> {
    let path = templates_path()?;
    if !path.exists() { return Ok(()); }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut templates: Vec<ConnectionTemplate> = serde_json::from_str(&data).unwrap_or_default();
    templates.retain(|t| t.id != id);
    let json = serde_json::to_string_pretty(&templates).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
