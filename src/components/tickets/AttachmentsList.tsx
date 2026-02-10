// =============================================================================
// PlumbTix — Attachments List + Upload with Video Compression (v0.4.0)
// =============================================================================
// • Image thumbnails + video thumbnails with play overlay
// • Lightbox: images fullscreen, videos with native controls
// • Upload: images go straight through, videos compress to H.264 MP4 first
// • Delete: all users can delete their own uploads
// • No file size limit — videos are compressed client-side before upload
// =============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchAttachments, getAttachmentUrl, type AttachmentRow } from '@/lib/tickets';
import { registerAttachment, deleteAttachment } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { shouldCompress, compressVideo } from '@/lib/videoCompressor';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ImageIcon, FileIcon, Download, X, ChevronLeft, ChevronRight,
  Plus, Loader2, Trash2, Play,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Config & Helpers
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska',
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isImageType(fileType: string | null): boolean {
  if (!fileType) return false;
  return fileType.startsWith('image/');
}

function isVideoType(fileType: string | null): boolean {
  if (!fileType) return false;
  return fileType.startsWith('video/');
}

function isMediaType(fileType: string | null): boolean {
  return isImageType(fileType) || isVideoType(fileType);
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
  status: 'compressing' | 'uploading' | 'registering' | 'done' | 'failed';
  error?: string;
  compressPercent?: number;
  compressInfo?: string; // e.g. "85 MB → 12 MB"
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

  // ─── Upload handler (with video compression) ───
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const valid: File[] = [];
    for (const f of fileArray) {
      // Accept any video type (will be compressed to mp4)
      if (!ALLOWED_TYPES.includes(f.type) && !f.type.startsWith('video/')) {
        toast.error(`${f.name}: unsupported file type`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    const progress: UploadingFile[] = valid.map((f) => ({
      name: f.name,
      status: shouldCompress(f) ? 'compressing' : 'uploading',
    }));
    setUploading([...progress]);

    // Count existing videos to continue sequential naming (video1, video2, ...)
    const existingVideoCount = items.filter((a) => isVideoType(a.file_type)).length;
    let videoIndex = 1;
    let successCount = 0;

    for (let i = 0; i < valid.length; i++) {
      let file = valid[i];

      // ─── Compress video ───
      if (shouldCompress(file)) {
        progress[i] = { ...progress[i], status: 'compressing', compressPercent: 0 };
        setUploading([...progress]);

        try {
          const result = await compressVideo(file, {
            maxHeight: 720,
            crf: 28,
            preset: 'fast',
            onProgress: (percent) => {
              progress[i] = { ...progress[i], compressPercent: percent };
              setUploading([...progress]);
            },
          });

          const info = `${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)}`;
          progress[i] = { ...progress[i], compressInfo: info };
          file = result.file; // use compressed file from here
          toast.success(`Compressed ${valid[i].name}: ${info}`);
        } catch (compErr) {
          const msg = compErr instanceof Error ? compErr.message : 'Compression failed';
          progress[i] = { ...progress[i], status: 'failed', error: msg };
          setUploading([...progress]);
          toast.error(`Compression failed: ${valid[i].name}`);
          continue;
        }
      }

      // ─── Upload to Storage ───
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = `tickets/${ticketId}/${safeName}`;

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

      // ─── Register metadata ───
      progress[i] = { ...progress[i], status: 'registering' };
      setUploading([...progress]);

      const result = await registerAttachment({
        ticket_id: ticketId,
        file_path: filePath,
        file_name: shouldCompress(valid[i]) ? `video${existingVideoCount + videoIndex++}.mp4` : valid[i].name,
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
    setTimeout(() => setUploading([]), 3000);
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
    setItems((prev) => prev.filter((a) => a.id !== att.id));
  }, []);

  // ─── Lightbox helpers ───
  const mediaItems = items.filter((a) => isMediaType(a.file_type) && a.signedUrl);
  const openLightbox = (attId: string) => {
    const idx = mediaItems.findIndex((m) => m.id === attId);
    if (idx >= 0) setLightboxIndex(idx);
  };
  const closeLightbox = () => setLightboxIndex(null);
  const prevImage = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const nextImage = () => setLightboxIndex((i) => (i !== null && i < mediaItems.length - 1 ? i + 1 : i));

  const isUploading = uploading.some((u) =>
    u.status === 'compressing' || u.status === 'uploading' || u.status === 'registering'
  );

  const media = items.filter((a) => isMediaType(a.file_type));
  const files = items.filter((a) => !isMediaType(a.file_type));

  // =========================================================================
  // RENDER
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
            accept={ALLOWED_TYPES.join(',') + ',video/*'}
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
            {isUploading ? 'Processing…' : 'Add Files'}
          </Button>
        </div>
      </div>

      {/* ─── Upload / Compression progress ─── */}
      {uploading.length > 0 && (
        <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
          {uploading.map((u, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {(u.status === 'compressing' || u.status === 'uploading' || u.status === 'registering') && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                )}
                {u.status === 'done' && <span className="text-green-600 shrink-0">✓</span>}
                {u.status === 'failed' && <span className="text-destructive shrink-0">✗</span>}
                <span className="truncate flex-1 font-medium">{u.name}</span>
                {u.status === 'compressing' && (
                  <span className="text-muted-foreground shrink-0">
                    Compressing{u.compressPercent != null ? ` ${u.compressPercent}%` : '…'}
                  </span>
                )}
                {u.status === 'uploading' && (
                  <span className="text-muted-foreground shrink-0">Uploading…</span>
                )}
                {u.status === 'registering' && (
                  <span className="text-muted-foreground shrink-0">Saving…</span>
                )}
                {u.status === 'done' && u.compressInfo && (
                  <span className="text-green-600 shrink-0">{u.compressInfo}</span>
                )}
                {u.status === 'failed' && u.error && (
                  <span className="text-destructive truncate max-w-[160px] shrink-0">{u.error}</span>
                )}
              </div>
              {/* Compression progress bar */}
              {u.status === 'compressing' && u.compressPercent != null && (
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${u.compressPercent}%` }}
                  />
                </div>
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

      {/* ─── Error state ─── */}
      {!loading && error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">Error loading attachments: {error}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!loading && !error && items.length === 0 && uploading.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No attachments yet. Tap "Add Files" to upload photos or videos.
        </p>
      )}

      {/* ─── Media thumbnails grid (images + videos) ─── */}
      {!loading && !error && media.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {media.map((att) => {
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
                  {isVideoType(att.file_type) ? (
                    <>
                      <video
                        src={att.signedUrl}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-black/60 rounded-full p-3">
                          <Play className="h-6 w-6 text-white fill-white" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <img
                      src={att.signedUrl}
                      alt={att.file_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                    <p className="text-[10px] text-white truncate">{att.file_name}</p>
                  </div>
                </button>
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

      {/* ─── Non-media files ─── */}
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

      {/* ─── Lightbox overlay (images + videos) ─── */}
      {lightboxIndex !== null && mediaItems[lightboxIndex] && (
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

          {isVideoType(mediaItems[lightboxIndex].file_type) ? (
            <video
              key={mediaItems[lightboxIndex].id}
              src={mediaItems[lightboxIndex].signedUrl!}
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={mediaItems[lightboxIndex].signedUrl!}
              alt={mediaItems[lightboxIndex].file_name}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {lightboxIndex < mediaItems.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10"
            >
              <ChevronRight className="h-10 w-10" />
            </button>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1.5 rounded-full">
            {mediaItems[lightboxIndex].file_name}
            {mediaItems.length > 1 && (
              <span className="text-white/60 ml-2">
                {lightboxIndex + 1} / {mediaItems.length}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
