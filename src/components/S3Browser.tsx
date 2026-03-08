import React, { useState, useEffect, useCallback } from 'react';
import {
  VscFolder, VscFile, VscArrowUp, VscRefresh,
  VscCloudUpload, VscCloudDownload, VscTrash,
} from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../types';

interface S3BrowserProps {
  sessionId: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const S3Browser: React.FC<S3BrowserProps> = ({ sessionId }) => {
  const [prefix, setPrefix] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const loadEntries = useCallback(async (p: string) => {
    setLoading(true);
    setError('');
    try {
      const items = await invoke<FileEntry[]>('s3_list', { s3Id: sessionId, prefix: p });
      setEntries(items);
      setPrefix(p);
      setSelected(null);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    loadEntries('');
  }, [loadEntries]);

  const navigateUp = () => {
    if (!prefix) return;
    const parts = prefix.replace(/\/$/, '').split('/');
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    loadEntries(newPrefix);
  };

  const handleClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      loadEntries(entry.path);
    } else {
      setSelected(entry.path === selected ? null : entry.path);
    }
  };

  const handleDownload = async () => {
    if (!selected) return;
    try {
      const data = await invoke<number[]>('s3_download', { s3Id: sessionId, key: selected });
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selected.split('/').pop() || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await invoke('s3_delete_object', { s3Id: sessionId, key: selected });
      setSelected(null);
      loadEntries(prefix);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const arrayBuf = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(arrayBuf));
      const key = prefix + file.name;
      try {
        await invoke('s3_upload', { s3Id: sessionId, key, data });
        loadEntries(prefix);
      } catch (err) {
        setError(String(err));
      }
    };
    input.click();
  };

  const breadcrumbs = prefix ? prefix.replace(/\/$/, '').split('/') : [];

  return (
    <div className="s3-browser">
      <div className="s3-browser__toolbar">
        <button className="s3-browser__tool-btn" onClick={navigateUp} disabled={!prefix} title="Go up">
          <VscArrowUp />
        </button>
        <button className="s3-browser__tool-btn" onClick={() => loadEntries(prefix)} title="Refresh">
          <VscRefresh />
        </button>
        <div className="s3-browser__toolbar-spacer" />
        <button className="s3-browser__tool-btn" onClick={handleUpload} title="Upload">
          <VscCloudUpload />
        </button>
        <button className="s3-browser__tool-btn" onClick={handleDownload} disabled={!selected} title="Download">
          <VscCloudDownload />
        </button>
        <button className="s3-browser__tool-btn" onClick={handleDelete} disabled={!selected} title="Delete">
          <VscTrash />
        </button>
      </div>

      <div className="s3-browser__breadcrumb">
        <button className="s3-browser__crumb" onClick={() => loadEntries('')}>
          /
        </button>
        {breadcrumbs.map((part, i) => {
          const crumbPath = breadcrumbs.slice(0, i + 1).join('/') + '/';
          return (
            <React.Fragment key={i}>
              <span className="s3-browser__crumb-sep">/</span>
              <button className="s3-browser__crumb" onClick={() => loadEntries(crumbPath)}>
                {part}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {error && <div className="s3-browser__error">{error}</div>}

      <div className="s3-browser__list">
        {loading ? (
          <div className="s3-browser__empty">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="s3-browser__empty">Empty</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.path}
              className={`s3-browser__item ${selected === entry.path ? 's3-browser__item--selected' : ''}`}
              onClick={() => handleClick(entry)}
              onDoubleClick={() => entry.is_dir && loadEntries(entry.path)}
            >
              <span className="s3-browser__item-icon">
                {entry.is_dir ? <VscFolder style={{ color: '#fab387' }} /> : <VscFile style={{ color: '#89b4fa' }} />}
              </span>
              <span className="s3-browser__item-name">{entry.name}</span>
              <span className="s3-browser__item-size">{entry.is_dir ? '' : formatSize(entry.size)}</span>
              {entry.modified && (
                <span className="s3-browser__item-date">{entry.modified.split('T')[0]}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default S3Browser;
