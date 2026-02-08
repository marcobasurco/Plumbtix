import { useEffect, useState } from 'react';
import { fetchAttachments, getAttachmentUrl, type AttachmentRow } from '@/lib/tickets';

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

interface AttachmentsListProps {
  ticketId: string;
}

export function AttachmentsList({ ticketId }: AttachmentsListProps) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAttachments(ticketId)
      .then((rows) => { if (!cancelled) setAttachments(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticketId]);

  const handleDownload = async (att: AttachmentRow) => {
    setDownloading(att.id);
    const url = await getAttachmentUrl(att.file_path);
    if (url) {
      window.open(url, '_blank');
    }
    setDownloading(null);
  };

  if (loading) return <p style={mutedStyle}>Loading attachments…</p>;
  if (error) return <p style={{ color: '#991b1b', fontSize: '0.85rem' }}>Error: {error}</p>;
  if (attachments.length === 0) return <p style={mutedStyle}>No attachments.</p>;

  return (
    <div>
      <h3 style={sectionTitle}>Attachments ({attachments.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {attachments.map((att) => (
          <div key={att.id} style={attachmentRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {att.file_name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {att.file_type ?? 'unknown'} · {formatFileSize(att.file_size)} · {att.uploaded_by?.full_name ?? 'Unknown'} · {formatDate(att.created_at)}
              </div>
            </div>
            <button
              onClick={() => handleDownload(att)}
              disabled={downloading === att.id}
              style={downloadBtn}
            >
              {downloading === att.id ? '…' : 'View'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 600, marginBottom: '12px',
  paddingBottom: '8px', borderBottom: '1px solid #e5e7eb',
};
const mutedStyle: React.CSSProperties = { color: '#9ca3af', fontSize: '0.85rem' };
const attachmentRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px',
  padding: '8px 12px', background: '#f9fafb', borderRadius: '6px',
  border: '1px solid #e5e7eb',
};
const downloadBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600,
  background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap',
};
