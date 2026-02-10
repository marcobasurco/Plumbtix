// =============================================================================
// PlumbTix — Attachments List (v0.4.0 Polish)
// =============================================================================
// Shows image thumbnails inline for photos, file links for non-image types.
// Lightbox for full-size image viewing with prev/next navigation.
// Uses signed URLs (5-min expiry) via Supabase Storage.
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { fetchAttachments, getAttachmentUrl, type AttachmentRow } from '@/lib/tickets';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ImageIcon, FileIcon, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';

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

interface AttachmentWithUrl extends AttachmentRow {
  signedUrl: string | null;
  urlError: boolean;
}

interface AttachmentsListProps {
  ticketId: string;
}

export function AttachmentsList({ ticketId }: AttachmentsListProps) {
  const [items, setItems] = useState<AttachmentWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAttachments(ticketId);

      // Fetch signed URLs in parallel
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

  // Lightbox helpers — only images with valid URLs
  const imageItems = items.filter((a) => isImageType(a.file_type) && a.signedUrl);

  const openLightbox = (attId: string) => {
    const idx = imageItems.findIndex((img) => img.id === attId);
    if (idx >= 0) setLightboxIndex(idx);
  };
  const closeLightbox = () => setLightboxIndex(null);
  const prevImage = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const nextImage = () => setLightboxIndex((i) => (i !== null && i < imageItems.length - 1 ? i + 1 : i));

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Attachments</h3>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    );
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Attachments</h3>
        <p className="text-sm text-destructive">Error: {error}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  // ─── Empty ───
  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Attachments</h3>
        <p className="text-sm text-muted-foreground mt-2">No attachments.</p>
      </div>
    );
  }

  const images = items.filter((a) => isImageType(a.file_type));
  const files = items.filter((a) => !isImageType(a.file_type));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Attachments ({items.length})
      </h3>

      {/* ─── Image thumbnails grid ─── */}
      {images.length > 0 && (
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
              <button
                key={att.id}
                type="button"
                onClick={() => openLightbox(att.id)}
                className="relative aspect-square rounded-lg overflow-hidden border border-border
                           hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer group"
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
            );
          })}
        </div>
      )}

      {/* ─── Non-image files ─── */}
      {files.map((att) => (
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
        </div>
      ))}

      {/* ─── Lightbox overlay ─── */}
      {lightboxIndex !== null && imageItems[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
          >
            <X className="h-7 w-7" />
          </button>

          {/* Previous */}
          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10"
            >
              <ChevronLeft className="h-10 w-10" />
            </button>
          )}

          {/* Full-size image */}
          <img
            src={imageItems[lightboxIndex].signedUrl!}
            alt={imageItems[lightboxIndex].file_name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {lightboxIndex < imageItems.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10"
            >
              <ChevronRight className="h-10 w-10" />
            </button>
          )}

          {/* Caption bar */}
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
