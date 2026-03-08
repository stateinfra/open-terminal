export type SessionType = 'local' | 'ssh' | 'telnet' | 'serial' | 'rdp' | 'vnc' | 'ftp' | 's3' | 'docker' | 'wsl';

export interface Tab {
  id: string;
  name: string;
  type: SessionType;
  sessionId: string;
  sftpId?: string;
  color?: string;
  disconnected?: boolean;
  sshInfo?: {
    host: string;
    port: number;
    username: string;
    keyPath?: string;
  };
}

export interface SavedSession {
  name: string;
  session_type: string;
  host?: string;
  port?: number;
  username?: string;
  auth_type?: string;
  identity_file?: string;
  shell?: string;
  group?: string;
  tags?: string[];
  color?: string;
  baud_rate?: number;
  serial_port?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified?: string;
}

export interface Snippet {
  id: string;
  name: string;
  description: string;
  command: string;
  tags: string[];
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
}

export interface WslDistro {
  name: string;
  state: string;
  version: string;
  is_default: boolean;
}

export interface HealthResult {
  host: string;
  reachable: boolean;
  latency_ms?: number;
  ssh_banner?: string;
  os_guess?: string;
}

export interface SystemInfo {
  os_name: string;
  os_version: string;
  hostname: string;
  username: string;
  arch: string;
  shells: ShellInfo[];
}

export interface ShellInfo {
  name: string;
  path: string;
  kind: string;
}

export interface RemoteOsInfo {
  pretty_name: string;
  kernel: string;
  arch: string;
  shells: string[];
}

export interface TunnelInfo {
  id: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
  status: string;
}

export interface SshConfigEntry {
  host: string;
  hostname?: string;
  user?: string;
  port?: number;
  identity_file?: string;
  proxy_jump?: string;
  proxy_command?: string;
}

export interface SshKeyResult {
  public_key_path: string;
  private_key_path: string;
  public_key_content: string;
}

export interface PortScanResult {
  port: number;
  open: boolean;
  service: string;
}

export interface CredentialEntry {
  id: string;
  label: string;
  username: string;
  password: string;
  host?: string;
  notes?: string;
}

export interface MacroKeystroke {
  data: string;
  delay_ms: number;
}

export interface MacroEntry {
  id: string;
  name: string;
  keystrokes: MacroKeystroke[];
}

export const PROTOCOL_INFO: Record<string, { label: string; defaultPort: number; color: string }> = {
  ssh: { label: 'SSH', defaultPort: 22, color: '#a6e3a1' },
  telnet: { label: 'Telnet', defaultPort: 23, color: '#f9e2af' },
  rdp: { label: 'RDP', defaultPort: 3389, color: '#89b4fa' },
  vnc: { label: 'VNC', defaultPort: 5900, color: '#cba6f7' },
  ftp: { label: 'FTP', defaultPort: 21, color: '#fab387' },
  serial: { label: 'Serial', defaultPort: 0, color: '#94e2d5' },
  s3: { label: 'S3', defaultPort: 0, color: '#fab387' },
  local: { label: 'Local Shell', defaultPort: 0, color: '#89b4fa' },
  docker: { label: 'Docker', defaultPort: 0, color: '#89b4fa' },
  wsl: { label: 'WSL', defaultPort: 0, color: '#f9e2af' },
};
