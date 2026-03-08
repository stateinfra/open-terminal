use std::path::{Path, PathBuf};

use ssh2::Session as Ssh2Session;
use uuid::Uuid;

/// Set restrictive file permissions (0o600) on Unix systems
#[cfg(unix)]
pub(crate) fn set_restrictive_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
pub(crate) fn set_restrictive_permissions(_path: &Path) {
    // Windows uses ACLs; file inherits parent directory permissions
}

/// Validate a file path stays within allowed directories
pub(crate) fn validate_path_within(path: &str, allowed_parent: &Path) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    let canonical = std::fs::canonicalize(&candidate)
        .or_else(|_| {
            // If file doesn't exist yet, canonicalize the parent
            candidate.parent()
                .and_then(|p| std::fs::canonicalize(p).ok())
                .map(|p| p.join(candidate.file_name().unwrap_or_default()))
                .ok_or_else(|| "Invalid path".to_string())
        })
        .map_err(|_| format!("Cannot resolve path: {}", path))?;
    let allowed = std::fs::canonicalize(allowed_parent)
        .map_err(|_| "Cannot resolve allowed directory".to_string())?;
    if !canonical.starts_with(&allowed) {
        return Err("Path traversal denied: path is outside allowed directory".to_string());
    }
    Ok(canonical)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn sessions_file_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join("open-terminal");
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("sessions.json"))
}

pub(crate) fn which_exists(name: &str) -> bool {
    std::process::Command::new("where")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub(crate) fn ssh_authenticate(
    sess: &Ssh2Session,
    username: &str,
    password: Option<&str>,
    key_path: Option<&str>,
) -> Result<(), String> {
    if let Some(key) = key_path {
        // Read key file to handle Unicode/special paths that libssh2 can't open directly
        let key_data = std::fs::read_to_string(key)
            .map_err(|e| format!("Cannot read key file '{}': {}", key, e))?;

        if key_data.contains("OPENSSH PRIVATE KEY") {
            return Err(
                "OpenSSH format key detected. Please convert to PEM format:\n\
                 ssh-keygen -p -m PEM -f your_key\n\
                 (This creates a PEM format key that is compatible)".to_string()
            );
        }

        // Copy to a temp file with ASCII-safe path for libssh2
        let temp_dir = std::env::temp_dir();
        let temp_key = temp_dir.join(format!("ot_key_{}", Uuid::new_v4()));
        std::fs::write(&temp_key, &key_data)
            .map_err(|e| format!("Cannot write temp key: {}", e))?;
        // Restrict temp key file permissions
        set_restrictive_permissions(&temp_key);

        let result = sess.userauth_pubkey_file(
            username, None, &temp_key, None,
        );

        // Clean up temp key immediately — log if removal fails
        if let Err(e) = std::fs::remove_file(&temp_key) {
            eprintln!("WARNING: Failed to remove temp key file {}: {}", temp_key.display(), e);
        }

        result.map_err(|e| format!("Key auth failed: {}", e))?;
    } else if let Some(pass) = password {
        sess.userauth_password(username, pass)
            .map_err(|e| format!("Password auth failed: {}", e))?;
    } else {
        return Err("Either password or key_path must be provided".to_string());
    }

    if !sess.authenticated() {
        return Err("SSH authentication failed".to_string());
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// AES encryption helpers
// ---------------------------------------------------------------------------

pub(crate) fn get_or_create_key() -> Result<[u8; 32], String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let key_path = config_dir.join("open-terminal").join(".keyfile");
    if key_path.exists() {
        let data = std::fs::read(&key_path).map_err(|e| e.to_string())?;
        if data.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&data);
            return Ok(key);
        }
    }
    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    std::fs::create_dir_all(key_path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&key_path, &key).map_err(|e| e.to_string())?;
    // Restrict key file to owner-only access
    set_restrictive_permissions(&key_path);
    Ok(key)
}

pub fn aes_encrypt(plaintext: &str) -> Result<String, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
    use aes_gcm::Nonce;
    use rand::RngCore;
    use base64::Engine;

    let key_bytes = get_or_create_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    // nonce (12) + ciphertext
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

pub fn aes_decrypt(encoded: &str) -> Result<String, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
    use aes_gcm::Nonce;
    use base64::Engine;

    let key_bytes = get_or_create_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let combined = match base64::engine::general_purpose::STANDARD.decode(encoded) {
        Ok(data) => data,
        Err(_) => {
            // Not valid base64 — try legacy XOR decode for migration
            return Ok(legacy_xor_decode(encoded));
        }
    };
    if combined.len() < 13 {
        // Too short for AES-GCM — try legacy XOR decode for migration
        return Ok(legacy_xor_decode(encoded));
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    match cipher.decrypt(nonce, ciphertext) {
        Ok(plaintext) => String::from_utf8(plaintext).map_err(|e| e.to_string()),
        Err(_) => {
            // AES decryption failed — try legacy XOR decode for migration
            Ok(legacy_xor_decode(encoded))
        }
    }
}

pub fn legacy_xor_decode(s: &str) -> String {
    let bytes: Vec<u8> = (0..s.len())
        .step_by(2)
        .filter_map(|i| s.get(i..i + 2).and_then(|h| u8::from_str_radix(h, 16).ok()))
        .map(|b| b ^ 0x5A)
        .collect();
    String::from_utf8(bytes).unwrap_or_default()
}
