use open_terminal_lib::{aes_decrypt, aes_encrypt, legacy_xor_decode, sessions_file_path};

#[test]
fn sessions_file_path_returns_valid_path() {
    let path = sessions_file_path().expect("sessions_file_path should succeed");
    assert!(path.is_absolute(), "Path should be absolute");
    assert!(
        path.parent().is_some(),
        "Path should have a parent directory"
    );
}

#[test]
fn sessions_file_path_ends_with_sessions_json() {
    let path = sessions_file_path().expect("sessions_file_path should succeed");
    let filename = path
        .file_name()
        .expect("should have a filename")
        .to_str()
        .expect("filename should be valid UTF-8");
    assert_eq!(filename, "sessions.json");
}

#[test]
fn aes_encrypt_decrypt_round_trip() {
    let original = "my_secret_password_123!@#";
    let encrypted = aes_encrypt(original).expect("encryption should succeed");

    // Encrypted value should differ from original
    assert_ne!(encrypted, original);

    let decrypted = aes_decrypt(&encrypted).expect("decryption should succeed");
    assert_eq!(decrypted, original);
}

#[test]
fn aes_encrypt_decrypt_empty_string() {
    let original = "";
    let encrypted = aes_encrypt(original).expect("encryption of empty string should succeed");
    let decrypted = aes_decrypt(&encrypted).expect("decryption should succeed");
    assert_eq!(decrypted, original);
}

#[test]
fn aes_encrypt_produces_different_ciphertexts() {
    // Due to random nonce, encrypting the same plaintext twice should produce different results
    let plaintext = "test_value";
    let enc1 = aes_encrypt(plaintext).expect("first encryption should succeed");
    let enc2 = aes_encrypt(plaintext).expect("second encryption should succeed");
    assert_ne!(enc1, enc2, "Two encryptions of the same plaintext should differ (random nonce)");
}

#[test]
fn legacy_xor_decode_produces_string() {
    // XOR encode "hello" with 0x5A: h=0x68^0x5A=0x32, e=0x65^0x5A=0x3F, l=0x6C^0x5A=0x36,
    // l=0x36, o=0x6F^0x5A=0x35
    let encoded = "323f363635";
    let decoded = legacy_xor_decode(encoded);
    assert_eq!(decoded, "hello");
}

#[test]
fn legacy_xor_decode_empty_input() {
    let decoded = legacy_xor_decode("");
    assert_eq!(decoded, "");
}
