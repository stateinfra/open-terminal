import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Tab } from '../types';

interface RemoteStats {
  cpu_usage: string | null;
  memory: string | null;
  disk: string | null;
  uptime: string | null;
  load_avg: string | null;
  processes: string | null;
}

interface MonitorData {
  cpu: number[];
  mem: number[];
  load: number[];
  stats: RemoteStats | null;
}

interface StatusBarProps {
  activeTab: Tab | undefined;
  terminalSize: { cols: number; rows: number };
  isHomeActive: boolean;
}

const MAX_HISTORY = 40;

function parsePercent(val: string | null): number {
  if (!val) return 0;
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.min(n, 100);
}

function parseMemPercent(val: string | null): number {
  if (!val) return 0;
  const match = val.match(/([\d.]+)\w?\/([\d.]+)\w?/);
  if (!match) return 0;
  const used = parseFloat(match[1]);
  const total = parseFloat(match[2]);
  if (total === 0) return 0;
  return Math.min((used / total) * 100, 100);
}

const SparkLine: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) return;

    ctx.fillStyle = color + '25';
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => {
      const x = (i / (MAX_HISTORY - 1)) * w;
      const y = h - (Math.min(v, 100) / 100) * h;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(((data.length - 1) / (MAX_HISTORY - 1)) * w, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (MAX_HISTORY - 1)) * w;
      const y = h - (Math.min(v, 100) / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, color]);

  return <canvas ref={canvasRef} width={80} height={16} className="statusbar__spark" />;
};

const StatusBar: React.FC<StatusBarProps> = ({ activeTab, terminalSize, isHomeActive }) => {
  // Per-session monitor cache: sftpId -> MonitorData
  const cacheRef = useRef<Record<string, MonitorData>>({});
  const [, forceUpdate] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sftpId = (!isHomeActive && activeTab?.type === 'ssh') ? activeTab.sftpId : undefined;

  const fetchStats = useCallback(async () => {
    if (!sftpId) return;
    try {
      const res = await invoke<RemoteStats>('get_remote_stats', { sftpId });
      const prev = cacheRef.current[sftpId] || { cpu: [], mem: [], load: [], stats: null };
      const cpuVal = parsePercent(res.cpu_usage);
      const memVal = parseMemPercent(res.memory);
      const loadVal = parsePercent(res.load_avg?.split(' ')[0] || null) * 25;
      cacheRef.current[sftpId] = {
        cpu: [...prev.cpu.slice(-(MAX_HISTORY - 1)), cpuVal],
        mem: [...prev.mem.slice(-(MAX_HISTORY - 1)), memVal],
        load: [...prev.load.slice(-(MAX_HISTORY - 1)), loadVal],
        stats: res,
      };
      forceUpdate(n => n + 1);
    } catch { /* ignore */ }
  }, [sftpId]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (sftpId) {
      fetchStats();
      intervalRef.current = setInterval(fetchStats, 3000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [sftpId, fetchStats]);

  const data = sftpId ? cacheRef.current[sftpId] : undefined;
  const hasMonitor = !!sftpId && !!data?.stats;

  return (
    <div className={`statusbar ${hasMonitor ? 'statusbar--monitor' : ''}`}>
      <div className="statusbar__left">
        {activeTab && !isHomeActive ? (
          <>
            <div className="statusbar__item">
              <span>{activeTab.type === 'ssh' ? 'SSH' : activeTab.type.toUpperCase()}: {activeTab.name}</span>
            </div>
            {activeTab.sshInfo && (
              <div className="statusbar__item">
                <span>{activeTab.sshInfo.host}:{activeTab.sshInfo.port}</span>
              </div>
            )}
          </>
        ) : (
          <div className="statusbar__item">
            <span>Ready</span>
          </div>
        )}
      </div>

      <div className="statusbar__right">
        {hasMonitor && data ? (
          <div className="statusbar__monitors">
            <div className="statusbar__monitor">
              <span className="statusbar__monitor-label">CPU</span>
              <SparkLine data={data.cpu} color="#a6e3a1" />
              <span className="statusbar__monitor-value" style={{ color: '#a6e3a1' }}>
                {data.stats?.cpu_usage ? `${data.stats.cpu_usage}%` : '-'}
              </span>
            </div>
            <div className="statusbar__monitor">
              <span className="statusbar__monitor-label">MEM</span>
              <SparkLine data={data.mem} color="#89b4fa" />
              <span className="statusbar__monitor-value" style={{ color: '#89b4fa' }}>
                {data.stats?.memory || '-'}
              </span>
            </div>
            <div className="statusbar__monitor">
              <span className="statusbar__monitor-label">LOAD</span>
              <SparkLine data={data.load} color="#fab387" />
              <span className="statusbar__monitor-value" style={{ color: '#fab387' }}>
                {data.stats?.load_avg?.split(' ')[0] || '-'}
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="statusbar__item">
              <span>{terminalSize.cols} x {terminalSize.rows}</span>
            </div>
            <div className="statusbar__item">
              <span>UTF-8</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StatusBar;
