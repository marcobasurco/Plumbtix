// =============================================================================
// Work Orders — Ticket Detail Page (v0.3.0 Polish)
// =============================================================================
// Full ticket view with info cards, status timeline, comments, attachments,
// and action panel. Uses shadcn/ui components + Tailwind for consistency.
// Mobile-responsive: stacks to single column on small screens.
// =============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchTicketDetail, type TicketDetailRow } from '@/lib/tickets';
import { useAuth } from '@/lib/auth';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { StatusTimeline } from './StatusTimeline';
import { CommentsThread } from './CommentsThread';
import { AttachmentsList } from './AttachmentsList';
import { ActionPanel } from './ActionPanel';
import { PageTransition } from '@/components/PageTransition';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ISSUE_TYPE_LABELS } from '@shared/types/enums';
import type { TicketStatus, UserRole } from '@shared/types/enums';
import { useRealtime } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import {
  ChevronLeft, FileText, MapPin, Wrench, Calendar,
  User, Phone, KeyRound, Clock, Printer, Download, Loader2,
} from 'lucide-react';
import { TicketReport } from './TicketReport';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ---------------------------------------------------------------------------
// Skeleton loading state
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-24" />
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info row helper
// ---------------------------------------------------------------------------

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-sm mt-0.5">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const isAdmin = role === 'proroto_admin';

  const [ticket, setTicket] = useState<TicketDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [printReady, setPrintReady] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const pdfReportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTicketDetail(ticketId);
      setTicket(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: live updates for this ticket
  useRealtime('tickets', load, { filter: `id=eq.${ticketId}`, enabled: !!ticketId && !loading });
  useRealtime('ticket_comments', load, { filter: `ticket_id=eq.${ticketId}`, enabled: !!ticketId && !loading });

  const handleUpdated = () => {
    load();
    setRefreshKey((k) => k + 1);
  };

  // ---------------------------------------------------------------------------
  // Print / PDF logic
  // ---------------------------------------------------------------------------
  // Visible to: pm_admin, pm_user, proroto_admin (always),
  //             resident (only if they submitted the ticket)
  const canPrint = (() => {
    if (!role || !ticket) return false;
    if (role === 'proroto_admin' || role === 'pm_admin' || role === 'pm_user') return true;
    if (role === 'resident' && profile?.id && ticket.created_by?.id === profile.id) return true;
    return false;
  })();

  const handlePrint = useCallback(() => {
    setPrintReady(true);
  }, []);

  const handleReportReady = useCallback(() => {
    window.print();
    const cleanup = () => {
      setPrintReady(false);
      toast.success('Work order sent to printer');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
  }, []);

  // ── PDF Download via html2canvas + jsPDF ──
  const handleDownloadPdf = useCallback(() => {
    setPdfReady(true);
    setPdfGenerating(true);
  }, []);

  const handlePdfReady = useCallback(async () => {
    const el = pdfReportRef.current;
    if (!el || !ticket) {
      setPdfReady(false);
      setPdfGenerating(false);
      return;
    }

    try {
      // Dynamic imports — keeps main bundle small
      const html2canvasModule = await import('html2canvas');
      const jspdfModule = await import('jspdf');
      const html2canvas = html2canvasModule.default;
      const JsPDF = jspdfModule.jsPDF ?? jspdfModule.default;

      // ── 1. Wait for all images (QR code, photos) to load ──
      const images = Array.from(el.querySelectorAll('img'));
      await Promise.allSettled(
        images.map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.onload = () => res();
                img.onerror = () => res(); // don't block on failed images
              })
        )
      );

      // ── 2. Force element visible for capture ──
      // html2canvas MUST see a fully-painted, on-screen element.
      // We temporarily make it visible behind a white overlay.
      const wrapper = el.closest('[data-pdf-wrapper]') as HTMLElement;
      if (wrapper) {
        wrapper.style.position = 'fixed';
        wrapper.style.left = '0';
        wrapper.style.top = '0';
        wrapper.style.width = '816px'; // letter width at 96dpi
        wrapper.style.zIndex = '99998';
        wrapper.style.opacity = '1';
        wrapper.style.visibility = 'visible';
        wrapper.style.overflow = 'visible';
        wrapper.style.background = '#ffffff';
      }

      // Small delay for browser paint
      await new Promise(r => setTimeout(r, 200));

      // ── 3. Capture with html2canvas ──
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        width: el.scrollWidth,
        height: el.scrollHeight,
        scrollY: 0,
        scrollX: 0,
        windowWidth: 816,
        onclone: (clonedDoc: Document) => {
          // Force light mode on the cloned document
          const clonedEl = clonedDoc.querySelector('#plumbtix-report') as HTMLElement;
          if (clonedEl) {
            clonedEl.style.background = '#ffffff';
            clonedEl.style.color = '#1a1a1a';
          }
          // Remove dark mode class if present
          clonedDoc.documentElement.classList.remove('dark');
          clonedDoc.body.style.background = '#ffffff';
          clonedDoc.body.style.color = '#1a1a1a';
        },
      });

      // ── 4. Generate PDF with proper multi-page slicing ──
      const pdf = new JsPDF('p', 'mm', 'letter');
      const pageWidth = pdf.internal.pageSize.getWidth();   // ~215.9mm
      const pageHeight = pdf.internal.pageSize.getHeight();  // ~279.4mm
      const margin = 10; // mm
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;

      // Calculate how the canvas maps to PDF dimensions
      const pxPerMm = canvas.width / contentWidth;
      const pageHeightPx = contentHeight * pxPerMm;
      const totalPages = Math.ceil(canvas.height / pageHeightPx);

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();

        // Slice a page-sized chunk from the canvas
        const sourceY = page * pageHeightPx;
        const sourceH = Math.min(pageHeightPx, canvas.height - sourceY);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sourceH;

        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          // Fill white background (prevents black pages)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          // Draw the relevant slice
          ctx.drawImage(
            canvas,
            0, sourceY, canvas.width, sourceH,
            0, 0, canvas.width, sourceH,
          );
        }

        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
        const sliceHeightMm = sourceH / pxPerMm;

        pdf.addImage(sliceData, 'JPEG', margin, margin, contentWidth, sliceHeightMm);
      }

      pdf.save(`WorkOrder-${ticket.ticket_number}.pdf`);
      toast.success('PDF downloaded');
    } catch (e) {
      console.error('[PDF] Generation failed:', e);
      toast.error('PDF generation failed. Try Print instead.');
    } finally {
      setPdfReady(false);
      setPdfGenerating(false);
    }
  }, [ticket]);

  if (loading) {
    return (
      <PageTransition>
        <DetailSkeleton />
      </PageTransition>
    );
  }
  if (error) return <ErrorBanner message={error} />;
  if (!ticket) return <ErrorBanner message="Ticket not found" />;

  const bld = ticket.building;
  const spc = ticket.space;
  const sched = ticket.scheduling_preference as {
    type?: string; preferred_date?: string; preferred_time?: string;
  } | null;

  const spaceLabel = spc.space_type === 'unit' && spc.unit_number
    ? `Unit ${spc.unit_number}`
    : spc.common_area_type?.replace(/_/g, ' ') ?? spc.space_type;

  return (
    <PageTransition>
      {/* Back button */}
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1" onClick={() => navigate('..', { relative: 'path' })}>
        <ChevronLeft className="h-3.5 w-3.5" /> Tickets
      </Button>

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6 pb-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">
            Ticket #{ticket.ticket_number}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Opened {formatDateTime(ticket.created_at)} by {ticket.created_by?.full_name ?? 'Unknown'}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {canPrint && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handlePrint}
                disabled={printReady}
              >
                <Printer className="h-3.5 w-3.5" />
                {printReady ? 'Preparing…' : 'Print'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
              >
                {pdfGenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />}
                {pdfGenerating ? 'Generating…' : 'Download PDF'}
              </Button>
            </>
          )}
          <SeverityBadge severity={ticket.severity} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      {/* Two-column layout — stacks on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left column: ticket info + timeline + comments */}
        <div className="space-y-5 min-w-0">

          {/* Ticket Details Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Ticket Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1 divide-y divide-border">
              <InfoRow
                icon={<Wrench className="h-4 w-4" />}
                label="Issue Type"
                value={ISSUE_TYPE_LABELS[ticket.issue_type as keyof typeof ISSUE_TYPE_LABELS] ?? ticket.issue_type}
              />
              {ticket.description && (
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label="Description"
                  value={<span className="whitespace-pre-wrap">{ticket.description}</span>}
                />
              )}
              {ticket.access_instructions && (
                <InfoRow
                  icon={<KeyRound className="h-4 w-4" />}
                  label="Access Instructions"
                  value={ticket.access_instructions}
                />
              )}
              {sched && (
                <InfoRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="Scheduling Preference"
                  value={
                    <>
                      {sched.type === 'asap' ? 'ASAP' : 'Preferred window'}
                      {sched.preferred_date && ` — ${sched.preferred_date}`}
                      {sched.preferred_time && ` (${sched.preferred_time})`}
                    </>
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Location Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1 divide-y divide-border">
              <InfoRow
                icon={<MapPin className="h-4 w-4" />}
                label="Building"
                value={
                  <>
                    {bld.name && <span className="font-semibold">{bld.name} — </span>}
                    {bld.address_line1}
                    {bld.address_line2 && `, ${bld.address_line2}`}
                    , {bld.city}, {bld.state} {bld.zip}
                  </>
                }
              />
              <InfoRow
                icon={<FileText className="h-4 w-4" />}
                label="Space"
                value={
                  <>
                    {spaceLabel}
                    {spc.floor !== null && spc.floor !== undefined && ` (Floor ${spc.floor})`}
                  </>
                }
              />
              {isAdmin && bld.gate_code && (
                <InfoRow
                  icon={<KeyRound className="h-4 w-4" />}
                  label="Gate Code"
                  value={<span className="font-mono font-semibold">{bld.gate_code}</span>}
                />
              )}
              {isAdmin && bld.onsite_contact_name && (
                <InfoRow
                  icon={<User className="h-4 w-4" />}
                  label="Onsite Contact"
                  value={
                    <>
                      {bld.onsite_contact_name}
                      {bld.onsite_contact_phone && (
                        <> — <a href={`tel:${bld.onsite_contact_phone}`} className="text-primary hover:underline">{bld.onsite_contact_phone}</a></>
                      )}
                    </>
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Work Details Card (only if there's data) */}
          {(ticket.assigned_technician || ticket.scheduled_date || ticket.quote_amount !== null || ticket.invoice_number || ticket.completed_at) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  Work Details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1 divide-y divide-border">
                {ticket.assigned_technician && (
                  <InfoRow icon={<User className="h-4 w-4" />} label="Technician" value={ticket.assigned_technician} />
                )}
                {ticket.scheduled_date && (
                  <InfoRow
                    icon={<Calendar className="h-4 w-4" />}
                    label="Scheduled"
                    value={`${ticket.scheduled_date}${ticket.scheduled_time_window ? ` (${ticket.scheduled_time_window})` : ''}`}
                  />
                )}
                {ticket.quote_amount !== null && (
                  <InfoRow icon={<FileText className="h-4 w-4" />} label="Quote" value={formatCurrency(ticket.quote_amount)} />
                )}
                {ticket.invoice_number && (
                  <InfoRow icon={<FileText className="h-4 w-4" />} label="Invoice" value={ticket.invoice_number} />
                )}
                {ticket.completed_at && (
                  <InfoRow icon={<Clock className="h-4 w-4" />} label="Completed" value={formatDateTime(ticket.completed_at)} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Contact Info Card */}
          {ticket.created_by && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Reported By
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1 divide-y divide-border">
                <InfoRow icon={<User className="h-4 w-4" />} label="Name" value={ticket.created_by.full_name} />
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label="Email"
                  value={<a href={`mailto:${ticket.created_by.email}`} className="text-primary hover:underline">{ticket.created_by.email}</a>}
                />
                {ticket.created_by.phone && (
                  <InfoRow
                    icon={<Phone className="h-4 w-4" />}
                    label="Phone"
                    value={<a href={`tel:${ticket.created_by.phone}`} className="text-primary hover:underline">{ticket.created_by.phone}</a>}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Status Timeline */}
          <Card>
            <CardContent className="p-4">
              <StatusTimeline ticketId={ticket.id} refreshKey={refreshKey} />
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardContent className="p-4">
              <CommentsThread ticketId={ticket.id} />
            </CardContent>
          </Card>
        </div>

        {/* Right column: action panel + attachments */}
        <div className="space-y-5">
          <ActionPanel
            ticketId={ticket.id}
            currentStatus={ticket.status as TicketStatus}
            onUpdated={handleUpdated}
          />
          <Card>
            <CardContent className="p-4">
              <AttachmentsList ticketId={ticket.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hidden print report — revealed by @media print CSS */}
      {printReady && role && (
        <div ref={reportRef} className="print-report">
          <TicketReport
            ticket={ticket}
            userRole={role as UserRole}
            onReady={handleReportReady}
            mode="print"
          />
        </div>
      )}

      {/* PDF capture container — must be visible for html2canvas */}
      {pdfReady && role && (
        <>
          {/* Overlay to hide the capture from the user */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '24px 32px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#333',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}>
              Generating PDF…
            </div>
          </div>
          {/* The actual report — rendered BEHIND the overlay but fully visible for capture */}
          <div
            data-pdf-wrapper
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              width: '816px',
              background: '#ffffff',
              zIndex: 99998,
              opacity: 1,
              visibility: 'visible',
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            <TicketReport
              ref={pdfReportRef}
              ticket={ticket}
              userRole={role as UserRole}
              onReady={handlePdfReady}
              mode="pdf"
            />
          </div>
        </>
      )}
    </PageTransition>
  );
}
