// =============================================================================
// Pro Roto App — Public Sharing Card (migration 00021)
// =============================================================================
// Ticket detail sidebar card for proroto_admin / pm_admin:
//   • Toggle public sharing on/off (revocable, token-based)
//   • Show the QR code on screen (scan it straight off the glass) + copy the link
//   • Regenerate token (burns all previously shared links/QRs)
// The printed work order's QR code points at this same public URL and is
// only rendered while sharing is enabled.
// =============================================================================

import { useEffect, useState } from 'react';
import { togglePublicSharing } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Link2, Copy, RefreshCw, Loader2, Globe, EyeOff } from 'lucide-react';

/** Base URL for public links. Falls back to current origin for previews. */
export function publicTicketUrl(token: string): string {
  const base = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
  return `${base.replace(/\/$/, '')}/p/${token}`;
}

interface SharingCardProps {
  ticketId: string;
  publicToken: string | null;
  publicEnabled: boolean;
  /** Refetch ticket after a change so PDF/QR state stays in sync */
  onChanged: () => void;
}

export function SharingCard({ ticketId, publicToken, publicEnabled, onChanged }: SharingCardProps) {
  const [busy, setBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const shareUrl = publicEnabled && publicToken ? publicTicketUrl(publicToken) : null;

  // On-screen QR for the public page — same code that is printed on the work
  // order. Generated in the browser (the link never leaves the device); the
  // library is loaded only when sharing is on.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    if (!shareUrl) return;
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(shareUrl, { width: 480, margin: 2, errorCorrectionLevel: 'M' }))
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((e) => console.warn('[SharingCard] QR generation failed:', e));
    return () => { cancelled = true; };
  }, [shareUrl]);

  const handleToggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      const res = await togglePublicSharing({ ticket_id: ticketId, enabled });
      if (!res.ok) throw new Error(res.error.message);
      toast.success(enabled ? 'Public sharing enabled' : 'Public sharing disabled — shared links revoked');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update sharing');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Public link copied');
    } catch {
      toast.error('Copy failed — long-press or select the link manually');
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm(
      'Regenerate the public link?\n\nEvery previously shared link and printed QR code for this work order will stop working.'
    )) return;
    setRegenBusy(true);
    try {
      const res = await togglePublicSharing({ ticket_id: ticketId, enabled: true, regenerate: true });
      if (!res.ok) throw new Error(res.error.message);
      toast.success('New public link generated — old links are dead');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate link');
    } finally {
      setRegenBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Public Sharing
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {publicEnabled
              ? <Globe className="h-4 w-4 text-green-600 dark:text-green-400" />
              : <EyeOff className="h-4 w-4 text-muted-foreground" />}
            <span className={publicEnabled ? '' : 'text-muted-foreground'}>
              {publicEnabled ? 'Anyone with the link can view' : 'Not publicly shared'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Switch
              checked={publicEnabled}
              onCheckedChange={handleToggle}
              disabled={busy || regenBusy}
              aria-label="Toggle public sharing"
            />
          </div>
        </div>

        {shareUrl && (
          <>
            {qrDataUrl && (
              <figure className="flex flex-col items-center gap-1.5">
                {/* White plate in both themes: phone cameras need dark-on-white */}
                <img
                  src={qrDataUrl}
                  alt="QR code that opens the public page for this work order"
                  width={192}
                  height={192}
                  className="h-48 w-48 rounded-md border border-border bg-white"
                />
                <figcaption className="text-xs text-muted-foreground text-center">
                  Scan with a phone camera to open the public page
                </figcaption>
              </figure>
            )}
            <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2">
              <p className="text-xs font-mono break-all select-all">{shareUrl}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={handleCopy} disabled={busy || regenBusy}>
                <Copy className="h-3.5 w-3.5" /> Copy link
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRegenerate} disabled={busy || regenBusy}>
                {regenBusy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                New link
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              This QR code is also printed on the work order (Print / Download PDF).
              It opens a limited, read-only page with no contact info or gate codes.
              Turning sharing off revokes the link and removes the QR from the screen
              and from new printouts.
            </p>
          </>
        )}

        {!publicEnabled && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Enable to get a shareable link and a QR code, shown here and printed on the work order.
            You can revoke access at any time.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
