// =============================================================================
// PlumbTix — Attachments List + Upload (v0.4.0)
// =============================================================================
// Image thumbnails in a grid with lightbox. "Add Files" button always visible.
// No dependency on the users JOIN (safe for all roles including resident).
// Flow: Storage upload → register-attachment edge function → refresh list.
// =============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchAttachments, getAttachmentUrl, type AttachmentRow } from '@/lib/tickets';
import { registerAttachment, deleteAttachment } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ImageIcon, FileIcon, Download, X, ChevronLeft, ChevronRight,
  Plus, Loader2, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'video/mp4', 'video/quicktime',
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(fileType: string | null): boolean {
  if (!fileType) return false;
  return fileType.startsWith('image/');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttachmentWithUrl extends AttachmentRow {
  signedUrl: string | null;
  urlError: boolean;
}

interface UploadingFile {
  name: string;
  status: 'uploading' | 'registering' | 'done' | 'failed';
  error?: string;
}

interface AttachmentsListProps {
  ticketId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttachmentsList({ ticketId }: AttachmentsListProps) {
  const [items, setItems] = useState<AttachmentWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Load attachments + signed URLs ───
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAttachments(ticketId);
      const withUrls: AttachmentWithUrl[] = await Promise.all(
        rows.map(async (att) => {
          try {
            const url = await getAttachmentUrl(att.file_path);
            return { ...att, signedUrl: url, urlError: !url };
          } catch {
            return { ...att, signedUrl: null, urlError: true };
          }
        }),
      );
      setItems(withUrls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // ─── Upload handler ───
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const valid: File[] = [];
    for (const f of fileArray) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} exceeds 10 MB limit`);
        continue;
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error(`${f.name}: unsupported file type`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    const progress: UploadingFile[] = valid.map((f) => ({
      name: f.name,
      status: 'uploading',
    }));
    setUploading([...progress]);

    let successCount = 0;

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = `tickets/${ticketId}/${safeName}`;

      // Step 1: Upload to Storage
      progress[i] = { ...progress[i], status: 'uploading' };
      setUploading([...progress]);

      const { error: uploadErr } = await supabase.storage
        .from('ticket-attachments')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadErr) {
        const msg = uploadErr.message || 'Unknown storage error';
        progress[i] = { ...progress[i], status: 'failed', error: msg };
        setUploading([...progress]);
        toast.error(`Upload failed: ${file.name} — ${msg}`);
        continue;
      }

      // Step 2: Register metadata
      progress[i] = { ...progress[i], status: 'registering' };
      setUploading([...progress]);

      const result = await registerAttachment({
        ticket_id: ticketId,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
      });

      if (!result.ok) {
        progress[i] = { ...progress[i], status: 'failed', error: result.error.message };
        setUploading([...progress]);
        toast.error(`Register failed: ${file.name}`);
      } else {
        progress[i] = { ...progress[i], status: 'done' };
        setUploading([...progress]);
        successCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`);
      await load();
    }
    setTimeout(() => setUploading([]), 2000);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [ticketId, load]);

  // ─── Delete handler ───
  const handleDelete = useCallback(async (att: AttachmentWithUrl) => {
    if (!confirm(`Delete "${att.file_name}"? This cannot be undone.`)) return;

    setDeleting(att.id);
    const result = await deleteAttachment({ id: att.id });
    setDeleting(null);

    if (!result.ok) {
      toast.error(`Delete failed: ${result.error.message}`);
      return;
    }

    toast.success(`Deleted ${att.file_name}`);
    // Remove from local state immediately (no need to refetch)
    setItems((prev) => prev.filter((a) => a.id !== att.id));
  }, []);

  // ─── Lightbox helpers ───
  const imageItems = items.filter((a) => isImageType(a.file_type) && a.signedUrl);
  const openLightbox = (attId: string) => {
    const idx = imageItems.findIndex((img) => img.id === attId);
    if (idx >= 0) setLightboxIndex(idx);
  };
  const closeLightbox = () => setLightboxIndex(null);
  const prevImage = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const nextImage = () => setLightboxIndex((i) => (i !== null && i < imageItems.length - 1 ? i + 1 : i));

  const isUploading = uploading.some((u) => u.status === 'uploading' || u.status === 'registering');

  const images = items.filter((a) => isImageType(a.file_type));
  const files = items.filter((a) => !isImageType(a.file_type));

  // =========================================================================
  // RENDER — Header + Upload button ALWAYS visible regardless of state
  // =========================================================================

  return (
    <div className="space-y-3">
      {/* ─── Header + Upload (always visible) ─── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Attachments{items.length > 0 ? ` (${items.length})` : ''}
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(',')}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {isUploading ? 'Uploading…' : 'Add Files'}
          </Button>
        </div>
      </div>

      {/* ─── Upload progress (always visible when uploading) ─── */}
      {uploading.length > 0 && (
        <div className="space-y-1.5">
          {uploading.map((u, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {(u.status === 'uploading' || u.status === 'registering') && (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              )}
              {u.status === 'done' && <span className="text-green-600">✓</span>}
              {u.status === 'failed' && <span className="text-destructive">✗</span>}
              <span className="truncate flex-1">{u.name}</span>
              {u.status === 'uploading' && (
                <span className="text-muted-foreground">Uploading…</span>
              )}
              {u.status === 'registering' && (
                <span className="text-muted-foreground">Saving…</span>
              )}
              {u.status === 'failed' && u.error && (
                <span className="text-destructive truncate max-w-[120px]">{u.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Loading state ─── */}
      {loading && (
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      )}

      {/* ─── Error state (with retry) ─── */}
      {!loading && error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">Error loading attachments: {error}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!loading && !error && items.length === 0 && uploading.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No attachments yet. Tap "Add Files" to upload photos.
        </p>
      )}

      {/* ─── Image thumbnails grid ─── */}
      {!loading && !error && images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((att) => {
            if (!att.signedUrl) {
              return (
                <div
                  key={att.id}
                  className="relative aspect-square rounded-lg bg-muted flex items-center justify-center border border-border"
                >
                  <div className="text-center p-2">
                    <ImageIcon className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xs text-destructive">Failed to load</p>
                  </div>
                </div>
              );
            }
            return (
              <div key={att.id} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                <button
                  type="button"
                  onClick={() => openLightbox(att.id)}
                  className="w-full h-full cursor-pointer"
                >
                  <img
                    src={att.signedUrl}
                    alt={att.file_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                    <p className="text-[10px] text-white truncate">{att.file_name}</p>
                  </div>
                </button>
                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(att); }}
                  disabled={deleting === att.id}
                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white/80
                             hover:bg-red-600 hover:text-white transition-colors
                             opacity-0 group-hover:opacity-100 z-10"
                  title="Delete"
                >
                  {deleting === att.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Non-image files ─── */}
      {!loading && !error && files.map((att) => (
        <div
          key={att.id}
          className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30"
        >
          <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{att.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {att.file_type ?? 'unknown'} · {formatFileSize(att.file_size)}
            </p>
          </div>
          {att.signedUrl ? (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => window.open(att.signedUrl!, '_blank')}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span className="text-xs text-destructive">Error</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            disabled={deleting === att.id}
            onClick={() => handleDelete(att)}
          >
            {deleting === att.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ))}

      {/* ─── Lightbox overlay ─── */}
      {lightboxIndex !== null && imageItems[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
          >
            <X className="h-7 w-7" />
          </button>

          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10"
            >
              <ChevronLeft className="h-10 w-10" />
            </button>
          )}

          <img
            src={imageItems[lightboxIndex].signedUrl!}
            alt={imageItems[lightboxIndex].file_name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {lightboxIndex < imageItems.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10"
            >
              <ChevronRight className="h-10 w-10" />
            </button>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1.5 rounded-full">
            {imageItems[lightboxIndex].file_name}
            {imageItems.length > 1 && (
              <span className="text-white/60 ml-2">
                {lightboxIndex + 1} / {imageItems.length}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
