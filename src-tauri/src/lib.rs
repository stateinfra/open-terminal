mod types;
mod helpers;

// Re-export for integration tests
pub use helpers::{aes_decrypt, aes_encrypt, legacy_xor_decode, sessions_file_path};
mod pty;
mod ssh;
mod session;
mod sftp;
mod protocols;
mod s3;
mod network;
mod tools;
mod credentials;
mod monitor;

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Local PTY
            pty::create_local_session,
            // SSH Terminal
            ssh::create_ssh_session,
            // Unified
            session::write_session,
            session::resize_session,
            session::close_session,
            // SFTP
            sftp::sftp_connect,
            sftp::sftp_list,
            sftp::sftp_read_file,
            sftp::sftp_write_file,
            sftp::sftp_delete,
            sftp::sftp_mkdir,
            sftp::sftp_rename,
            sftp::sftp_chmod,
            sftp::sftp_disconnect,
            // Telnet
            protocols::create_telnet_session,
            // Serial
            protocols::list_serial_ports,
            protocols::create_serial_session,
            // RDP / VNC
            protocols::launch_rdp,
            protocols::launch_vnc,
            // FTP
            protocols::create_ftp_session,
            // S3
            s3::s3_connect,
            s3::s3_list_buckets,
            s3::s3_list,
            s3::s3_download,
            s3::s3_upload,
            s3::s3_delete_object,
            s3::s3_disconnect,
            // SSH Tunnel
            network::create_ssh_tunnel,
            network::list_tunnels,
            network::close_tunnel,
            // Port Scanner
            network::scan_ports,
            // Wake-on-LAN
            network::send_wol,
            // Network Tools
            network::run_ping,
            network::run_traceroute,
            network::run_nslookup,
            // Session Logging
            session::start_session_log,
            session::stop_session_log,
            session::log_session_data,
            // Session Import/Export
            session::export_sessions,
            session::import_sessions,
            // Session management
            session::save_session,
            session::load_sessions,
            session::delete_session,
            // Docker (XPipe)
            tools::list_docker_containers,
            tools::create_docker_session,
            // WSL (XPipe)
            tools::list_wsl_distros,
            tools::create_wsl_session,
            // Script Snippets (XPipe)
            tools::load_snippets,
            tools::save_snippet,
            tools::delete_snippet,
            // Health Check (XPipe)
            tools::check_host_health,
            // System Info (XPipe)
            tools::get_system_info,
            tools::detect_remote_os,
            // SSH Config
            credentials::parse_ssh_config,
            credentials::import_ssh_config,
            // SSH Key Generator
            credentials::generate_ssh_key,
            credentials::list_ssh_keys,
            // Password Manager
            credentials::save_credential,
            credentials::load_credentials,
            credentials::delete_credential,
            // Macro Recording
            credentials::save_macro,
            credentials::load_macros,
            credentials::delete_macro,
            // Public Key Distribution
            credentials::distribute_public_key,
            // Environment Variable Presets
            credentials::save_env_preset,
            credentials::load_env_presets,
            credentials::delete_env_preset,
            // Connection Templates
            credentials::save_template,
            credentials::load_templates,
            credentials::delete_template,
            // Proxy Jump SSH
            ssh::create_proxy_ssh_session,
            // SFTP Progress
            sftp::sftp_download_with_progress,
            sftp::sftp_upload_with_progress,
            // SFTP Bookmarks
            sftp::save_sftp_bookmark,
            sftp::load_sftp_bookmarks,
            sftp::delete_sftp_bookmark,
            // Remote Monitor
            monitor::get_remote_stats,
            // Local HTTP Server
            network::start_http_server,
            network::stop_http_server,
            // Network Connections
            network::get_network_connections,
            // Auto Connect
            ssh::auto_connect_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
