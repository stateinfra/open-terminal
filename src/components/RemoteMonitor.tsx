import React, { useState, useEffect, useRef, useCallback } from 'react';
// no icons needed
import { invoke } from '@tauri-apps/api/core';

interface RemoteStats {
  cpu_usage: string | null;
  memory: string | null;
  disk: string | null;
  uptime: string | null;
  load_avg: string | null;
  processes: string | null;
}

interface RemoteMonitorProps {
  sftpId: string;
  hostName: string;
}

const MAX_HISTORY = 60;

function parsePercent(val: string | null): number {
  if (!val) return 0;
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.min(n, 100);
}

function parseMemPercent(val: string | null): number {
  if (!val) return 0;
  // format: "1.2G/3.8G" -> parse numerator/denominator
  const match = val.match(/([\d.]+)\w?\/([\d.]+)\w?/);
  if (!match) return 0;
  const used = parseFloat(match[1]);
  const total = parseFloat(match[2]);
  if (total === 0) return 0;
  return Math.min((used / total) * 100, 100);
}

const MiniGraph: React.FC<{ data: number[]; color: string; label: string; value: string; max?: number }> = ({
  data, color, label, value, max = 100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(69, 71, 90, 0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (data.length < 2) return;

    // Fill area
    ctx.fillStyle = color + '20';
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => {
      const x = (i / (MAX_HISTORY - 1)) * w;
      const y = h - (Math.min(v, max) / max) * h;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(((data.length - 1) / (MAX_HISTORY - 1)) * w, h);
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (MAX_HISTORY - 1)) * w;
      const y = h - (Math.min(v, max) / max) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, color, max]);

  return (
    <div className="rmon__graph">
      <div className="rmon__graph-header">
        <span className="rmon__graph-label">{label}</span>
        <span className="rmon__graph-value" style={{ color }}>{value}</span>
      </div>
      <canvas ref={canvasRef} width={200} height={40} className="rmon__canvas" />
    </div>
  );
};

const RemoteMonitor: React.FC<RemoteMonitorProps> = ({ sftpId, hostName }) => {
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [loadHistory, setLoadHistory] = useState<number[]>([]);
  const [stats, setStats] = useState<RemoteStats | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await invoke<RemoteStats>('get_remote_stats', { sftpId });
      setStats(res);
      const cpuVal = parsePercent(res.cpu_usage);
      const memVal = parseMemPercent(res.memory);
      const loadVal = parsePercent(res.load_avg?.split(' ')[0] || null) * 25; // scale 0-4 to 0-100

      setCpuHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), cpuVal]);
      setMemHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), memVal]);
      setLoadHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), loadVal]);
    } catch { /* ignore */ }
  }, [sftpId]);

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStats]);

  return (
    <div className="rmon">
      <div className="rmon__header">
        <span className="rmon__title">{hostName} - System Monitor</span>
        <div className="rmon__stats-row">
          {stats?.disk && <span className="rmon__stat">Disk: {stats.disk}</span>}
          {stats?.processes && <span className="rmon__stat">Procs: {stats.processes}</span>}
        </div>
{/* monitor always visible — no close button */}
      </div>
      <div className="rmon__graphs">
        <MiniGraph data={cpuHistory} color="#a6e3a1" label="CPU" value={stats?.cpu_usage ? `${stats.cpu_usage}%` : '-'} />
        <MiniGraph data={memHistory} color="#89b4fa" label="Memory" value={stats?.memory || '-'} />
        <MiniGraph data={loadHistory} color="#fab387" label="Load" value={stats?.load_avg || '-'} />
      </div>
    </div>
  );
};

export default RemoteMonitor;
