import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  VscFolder,
  VscFile,
  VscRefresh,
  VscNewFolder,
  VscTrash,
  VscArrowUp,
  VscCloudUpload,
  VscCloudDownload,
  VscEdit,
  VscCopy,
  VscNewFile,
  VscTerminal,
  VscLock,
  VscFolderOpened,
} from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FileEntry } from '../types';

interface SftpSidebarProps {
  sftpId: string;
  sessionId: string;
  onEditFile?: (sftpId: string, path: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} G`;
}

const SftpSidebar: React.FC<SftpSidebarProps> = ({ sftpId, sessionId, onEditFile }) => {
  const [currentPath, setCurrentPath] = useState('/home');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [transferProgress, setTransferProgress] = useState<{ path: string; percent: number; direction: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const files = await invoke<FileEntry[]>('sftp_list', { sftpId, path });
        setEntries(files);
        setCurrentPath(path);
        setSelectedFile(null);
        setRenamingFile(null);
      } catch (err) {
        console.error('SFTP list failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [sftpId]
  );

  useEffect(() => {
    loadDirectory('/home');
  }, [loadDirectory]);

  // Listen for SFTP progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ sftp_id: string; path: string; transferred: number; total: number; direction: string }>(
      'sftp-progress',
      (event) => {
        if (event.payload.sftp_id === sftpId) {
          const percent = event.payload.total > 0
            ? Math.round((event.payload.transferred / event.payload.total) * 100)
            : 0;
          setTransferProgress({
            path: event.payload.path.split('/').pop() || '',
            percent,
            direction: event.payload.direction,
          });
          if (percent >= 100) {
            setTimeout(() => setTransferProgress(null), 1000);
          }
        }
      }
    ).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [sftpId]);

  // Close context menu on click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const navigateUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDirectory(parent);
  };

  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      loadDirectory(entry.path);
    } else if (onEditFile) {
      onEditFile(sftpId, entry.path);
    }
  };

  const handleMkdir = async () => {
    const name = prompt('Folder name:');
    if (!name) return;
    const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await invoke('sftp_mkdir', { sftpId, path: newPath });
      loadDirectory(currentPath);
    } catch (err) {
      console.error('mkdir failed:', err);
    }
  };

  const handleDelete = async (entry?: FileEntry) => {
    const target = entry || entries.find((e) => e.path === selectedFile);
    if (!target) return;
    if (!confirm(`Delete: ${target.name}?`)) return;
    try {
      await invoke('sftp_delete', { sftpId, path: target.path, isDir: target.is_dir });
      loadDirectory(currentPath);
    } catch (err) {
      console.error('delete failed:', err);
    }
  };

  const handleRename = async (entry: FileEntry) => {
    setRenamingFile(entry.path);
    setRenameValue(entry.name);
  };

  const submitRename = async (oldPath: string) => {
    if (!renameValue.trim()) { setRenamingFile(null); return; }
    const parentDir = oldPath.split('/').slice(0, -1).join('/');
    const newPath = `${parentDir}/${renameValue.trim()}`;
    try {
      await invoke('sftp_rename', { sftpId, oldPath, newPath });
      loadDirectory(currentPath);
    } catch (err) {
      console.error('rename failed:', err);
    }
    setRenamingFile(null);
  };

  const handleDownload = async (entry?: FileEntry) => {
    const target = entry || entries.find((e) => e.path === selectedFile);
    if (!target || target.is_dir) return;
    try {
      const data = await invoke<number[]>('sftp_download_with_progress', {
        sftpId, path: target.path,
      });
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = target.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('download failed:', err);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const arrayBuffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(arrayBuffer));
      const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      try {
        await invoke('sftp_upload_with_progress', { sftpId, path: remotePath, data });
      } catch (err) {
        console.error('upload failed:', err);
      }
    }
    loadDirectory(currentPath);
  };

  // Drag & drop from local desktop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleCopyPath = (entry: FileEntry) => {
    navigator.clipboard.writeText(entry.path);
  };

  const handleNewFile = async () => {
    const name = prompt('File name:');
    if (!name) return;
    const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await invoke('sftp_upload_with_progress', { sftpId, path: newPath, data: [] });
      loadDirectory(currentPath);
    } catch (err) {
      console.error('create file failed:', err);
    }
  };

  const handleChmod = async (entry: FileEntry) => {
    const mode = prompt('Permissions (e.g. 755, 644):', '644');
    if (!mode || !/^[0-7]{3}$/.test(mode)) return;
    try {
      await invoke('sftp_chmod', { sftpId, path: entry.path, mode: parseInt(mode, 8) });
      loadDirectory(currentPath);
    } catch (err) {
      console.error('chmod failed:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const handleBgContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.sftp-file')) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry: null as any });
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div
      className={`sftp-sidebar ${dragOver ? 'sftp-sidebar--dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="sftp-sidebar__header">
        <span className="sftp-sidebar__title">SFTP</span>
      </div>

      {/* Transfer progress */}
      {transferProgress && (
        <div className="sftp-sidebar__progress">
          <div className="sftp-sidebar__progress-text">
            {transferProgress.direction === 'upload' ? '↑' : '↓'} {transferProgress.path}
          </div>
          <div className="sftp-sidebar__progress-bar">
            <div
              className="sftp-sidebar__progress-fill"
              style={{ width: `${transferProgress.percent}%` }}
            />
          </div>
          <span className="sftp-sidebar__progress-pct">{transferProgress.percent}%</span>
        </div>
      )}

      {/* Path bar */}
      <div className="sftp-sidebar__pathbar">
        <button className="sftp-sidebar__path-btn" onClick={navigateUp} title="Parent">
          <VscArrowUp />
        </button>
        <div className="sftp-sidebar__path">
          <button className="sftp-sidebar__path-seg" onClick={() => loadDirectory('/')}>
            /
          </button>
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              <span className="sftp-sidebar__path-sep">/</span>
              <button
                className="sftp-sidebar__path-seg"
                onClick={() => loadDirectory('/' + pathParts.slice(0, i + 1).join('/'))}
              >
                {part}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="sftp-sidebar__toolbar">
        <button className="sftp-sidebar__tool-btn" onClick={() => loadDirectory(currentPath)} title="Refresh">
          <VscRefresh />
        </button>
        <button className="sftp-sidebar__tool-btn" onClick={handleMkdir} title="New Folder">
          <VscNewFolder />
        </button>
        <button className="sftp-sidebar__tool-btn" onClick={() => handleDelete()} title="Delete" disabled={!selectedFile}>
          <VscTrash />
        </button>
        <div className="sftp-sidebar__toolbar-spacer" />
        <button className="sftp-sidebar__tool-btn" onClick={() => fileInputRef.current?.click()} title="Upload">
          <VscCloudUpload />
        </button>
        <button className="sftp-sidebar__tool-btn" onClick={() => handleDownload()} title="Download" disabled={!selectedFile || entries.find(e => e.path === selectedFile)?.is_dir}>
          <VscCloudDownload />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* File list */}
      <div className="sftp-sidebar__files" onContextMenu={handleBgContextMenu}>
        {loading ? (
          <div className="sftp-sidebar__empty">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="sftp-sidebar__empty">Empty directory</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.path}
              className={`sftp-file ${selectedFile === entry.path ? 'sftp-file--selected' : ''}`}
              onClick={() => setSelectedFile(entry.path)}
              onDoubleClick={() => handleDoubleClick(entry)}
              onContextMenu={(e) => handleContextMenu(e, entry)}
            >
              <span className="sftp-file__icon">
                {entry.is_dir ? (
                  <VscFolder style={{ color: 'var(--yellow)' }} />
                ) : (
                  <VscFile style={{ color: 'var(--subtext0)' }} />
                )}
              </span>
              {renamingFile === entry.path ? (
                <input
                  className="sftp-file__rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => submitRename(entry.path)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitRename(entry.path); if (e.key === 'Escape') setRenamingFile(null); }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="sftp-file__name">{entry.name}</span>
              )}
              <span className="sftp-file__size">
                {entry.is_dir ? '' : formatSize(entry.size)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="sftp-sidebar__drop-overlay">
          <VscCloudUpload style={{ fontSize: '2rem' }} />
          <span>Drop files here to upload</span>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={() => setContextMenu(null)}>
          {contextMenu.entry ? (
            <>
              {contextMenu.entry.is_dir && (
                <button className="context-menu__item" onClick={() => { loadDirectory(contextMenu.entry.path); setContextMenu(null); }}>
                  <VscFolderOpened style={{ marginRight: 6 }} /> Open
                </button>
              )}
              {!contextMenu.entry.is_dir && onEditFile && (
                <button className="context-menu__item" onClick={() => { onEditFile(sftpId, contextMenu.entry.path); setContextMenu(null); }}>
                  <VscEdit style={{ marginRight: 6 }} /> Edit
                </button>
              )}
              {!contextMenu.entry.is_dir && (
                <button className="context-menu__item" onClick={() => { handleDownload(contextMenu.entry); setContextMenu(null); }}>
                  <VscCloudDownload style={{ marginRight: 6 }} /> Download
                </button>
              )}
              <div className="context-menu__sep" />
              <button className="context-menu__item" onClick={() => { handleCopyPath(contextMenu.entry); setContextMenu(null); }}>
                <VscCopy style={{ marginRight: 6 }} /> Copy Path
              </button>
              <button className="context-menu__item" onClick={() => { handleRename(contextMenu.entry); setContextMenu(null); }}>
                <VscEdit style={{ marginRight: 6 }} /> Rename
              </button>
              <button className="context-menu__item" onClick={() => { handleChmod(contextMenu.entry); setContextMenu(null); }}>
                <VscLock style={{ marginRight: 6 }} /> Permissions
              </button>
              <div className="context-menu__sep" />
              <button className="context-menu__item context-menu__item--danger" onClick={() => { handleDelete(contextMenu.entry); setContextMenu(null); }}>
                <VscTrash style={{ marginRight: 6 }} /> Delete
              </button>
            </>
          ) : (
            <>
              <button className="context-menu__item" onClick={() => { handleNewFile(); setContextMenu(null); }}>
                <VscNewFile style={{ marginRight: 6 }} /> New File
              </button>
              <button className="context-menu__item" onClick={() => { handleMkdir(); setContextMenu(null); }}>
                <VscNewFolder style={{ marginRight: 6 }} /> New Folder
              </button>
              <div className="context-menu__sep" />
              <button className="context-menu__item" onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }}>
                <VscCloudUpload style={{ marginRight: 6 }} /> Upload
              </button>
              <button className="context-menu__item" onClick={() => { loadDirectory(currentPath); setContextMenu(null); }}>
                <VscRefresh style={{ marginRight: 6 }} /> Refresh
              </button>
              <div className="context-menu__sep" />
              <button className="context-menu__item" onClick={() => { navigator.clipboard.writeText(currentPath); setContextMenu(null); }}>
                <VscCopy style={{ marginRight: 6 }} /> Copy Path
              </button>
              <button className="context-menu__item" onClick={() => { navigator.clipboard.writeText(`cd ${currentPath}`); setContextMenu(null); }}>
                <VscTerminal style={{ marginRight: 6 }} /> Copy cd command
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SftpSidebar;
