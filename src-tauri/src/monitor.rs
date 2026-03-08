use std::io::Read as IoRead;

use serde::Serialize;
use ssh2::Session as Ssh2Session;

use crate::types::*;

// ---------------------------------------------------------------------------
// Remote System Monitor (via SSH exec)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct RemoteStats {
    cpu_usage: Option<String>,
    memory: Option<String>,
    disk: Option<String>,
    uptime: Option<String>,
    load_avg: Option<String>,
    processes: Option<String>,
}

fn ssh_exec_command(sess: &Ssh2Session, command: &str) -> Result<String, String> {
    let mut channel = sess.channel_session().map_err(|e| e.to_string())?;
    channel.exec(command).map_err(|e| e.to_string())?;
    let mut output = String::new();
    channel.read_to_string(&mut output).map_err(|e| e.to_string())?;
    channel.wait_close().map_err(|e| e.to_string())?;
    Ok(output.trim().to_string())
}

#[tauri::command]
pub fn get_remote_stats(sftp_id: String) -> Result<RemoteStats, String> {
    let sessions = SFTP_SESSIONS.lock();
    let sess = sessions.get(&sftp_id)
        .ok_or_else(|| format!("Session '{}' not found", sftp_id))?;

    let cpu_usage = ssh_exec_command(sess, "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' 2>/dev/null || echo 'N/A'").ok();
    let memory = ssh_exec_command(sess, "free -h 2>/dev/null | grep Mem | awk '{print $3\"/\"$2}' || echo 'N/A'").ok();
    let disk = ssh_exec_command(sess, "df -h / 2>/dev/null | tail -1 | awk '{print $3\"/\"$2\" (\"$5\")\"}'").ok();
    let uptime = ssh_exec_command(sess, "uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}'").ok();
    let load_avg = ssh_exec_command(sess, "cat /proc/loadavg 2>/dev/null | awk '{print $1\" \"$2\" \"$3}'").ok();
    let processes = ssh_exec_command(sess, "ps aux --no-heading 2>/dev/null | wc -l || echo '0'").ok();

    Ok(RemoteStats { cpu_usage, memory, disk, uptime, load_avg, processes })
}
