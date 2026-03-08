import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VscEdit, VscSave, VscClose } from 'react-icons/vsc';

interface RemoteFileEditorProps {
  sftpId: string;
  filePath: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function RemoteFileEditor({
  sftpId,
  filePath,
  onClose,
  onSaved,
}: RemoteFileEditorProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true);
        const bytes: number[] = await invoke('sftp_read_file', {
          sftpId,
          path: filePath,
        });
        const decoded = new TextDecoder().decode(new Uint8Array(bytes));
        setContent(decoded);
      } catch (err) {
        console.error('File read failed:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [sftpId, filePath]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = Array.from(new TextEncoder().encode(content));
      await invoke('sftp_write_file', { sftpId, path: filePath, data });
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
      onSaved?.();
    } catch (err) {
      console.error('File save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const lineCount = content.split('\n').length;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog"
        style={{ width: '60rem', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__header">
          <VscEdit style={{ marginRight: '0.5rem' }} />
          <span title={filePath}>{filePath}</span>
        </div>

        <div
          className="dialog__body"
          style={{
            display: 'flex',
            flex: 1,
            overflow: 'hidden',
            padding: 0,
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '2rem',
              }}
            >
              Loading...
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flex: 1,
                overflow: 'auto',
                position: 'relative',
              }}
            >
              <div
                style={{
                  padding: '0.5rem 0.5rem',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  textAlign: 'right',
                  userSelect: 'none',
                  color: '#888',
                  borderRight: '1px solid #333',
                  minWidth: '3rem',
                  flexShrink: 0,
                }}
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i + 1}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  padding: '0.5rem',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  whiteSpace: 'pre',
                  overflowWrap: 'normal',
                  overflowX: 'auto',
                }}
              />
            </div>
          )}
        </div>

        <div className="dialog__footer">
          <button onClick={handleSave} disabled={saving || loading}>
            <VscSave style={{ marginRight: '0.25rem' }} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose}>
            <VscClose style={{ marginRight: '0.25rem' }} />
            Close
          </button>
        </div>

        {showToast && (
          <div
            style={{
              position: 'absolute',
              bottom: '4rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#2ea043',
              color: '#fff',
              padding: '0.5rem 1.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.9rem',
              zIndex: 10,
            }}
          >
            Saved
          </div>
        )}
      </div>
    </div>
  );
}
