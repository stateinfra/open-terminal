use std::path::PathBuf;

use ssh2::Session as Ssh2Session;
use uuid::Uuid;

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

        let result = sess.userauth_pubkey_file(
            username, None, &temp_key, None,
        );

        // Clean up temp key immediately
        let _ = std::fs::remove_file(&temp_key);

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
    let combined = base64::engine::general_purpose::STANDARD.decode(encoded)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
    if combined.len() < 13 {
        // Fallback: try legacy XOR decode for migration
        return Ok(legacy_xor_decode(encoded));
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| {
            // Decryption failed — try legacy XOR decode for migration
            format!("LEGACY:{}", encoded)
        })?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

pub fn legacy_xor_decode(s: &str) -> String {
    let bytes: Vec<u8> = (0..s.len())
        .step_by(2)
        .filter_map(|i| s.get(i..i + 2).and_then(|h| u8::from_str_radix(h, 16).ok()))
        .map(|b| b ^ 0x5A)
        .collect();
    String::from_utf8(bytes).unwrap_or_default()
}
