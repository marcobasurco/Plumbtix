// =============================================================================
// PlumbTix — PDF Generation Helpers
// =============================================================================
// Fetches ticket supporting data, renders TicketPdfDocument via
// @react-pdf/renderer, and provides:
//   • downloadTicketPdf()  — triggers a file download
//   • printTicketPdf()     — opens PDF in new tab and auto-prints
// Fully programmatic — no DOM capture, no html2canvas.
// =============================================================================

import { pdf } from '@react-pdf/renderer';
import { TicketPdfDocument } from './TicketPdfDocument';
import type { PdfCommentEntry, PdfTicketData } from './TicketPdfDocument';
import { fetchStatusLog, fetchAttachments } from '@/lib/tickets';
import { getTicketComments } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import type { TicketDetailRow } from '@/lib/tickets';
import type { UserRole } from '@shared/types/enums';

/**
 * Internal: fetch supporting data and render PDF to a Blob.
 */
async function generatePdfBlob(
  ticket: TicketDetailRow,
  role: UserRole,
): Promise<Blob> {
  // ── 1. Fetch supporting data in parallel ──
  const [commentsRes, statusLog, attachments] = await Promise.all([
    getTicketComments(ticket.id),
    fetchStatusLog(ticket.id),
    fetchAttachments(ticket.id),
  ]);

  const comments: PdfCommentEntry[] = commentsRes.ok
    ? (commentsRes.data.comments as PdfCommentEntry[])
    : [];

  // ── 2. Get signed URLs for image attachments ──
  const imageAttachments = attachments.filter(a =>
    a.file_type?.startsWith('image/')
  );

  const photoUrls: { name: string; url: string }[] = [];
  for (const att of imageAttachments) {
    try {
      const { data } = await supabase.storage
        .from('ticket-attachments')
        .createSignedUrl(att.file_path, 600);
      if (data?.signedUrl) {
        photoUrls.push({ name: att.file_name, url: data.signedUrl });
      }
    } catch {
      // Skip failed images
    }
  }

  const pdfData: PdfTicketData = { statusLog, comments, photoUrls };

  // ── 3. Render PDF document to blob ──
  return pdf(
    <TicketPdfDocument ticket={ticket} userRole={role} data={pdfData} />
  ).toBlob();
}

/**
 * Generate and download a PDF for a ticket.
 */
export async function downloadTicketPdf(
  ticket: TicketDetailRow,
  role: UserRole,
): Promise<void> {
  const blob = await generatePdfBlob(ticket, role);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `WorkOrder-${ticket.ticket_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Generate the PDF, open in a new tab, and auto-trigger print.
 * Uses the exact same @react-pdf/renderer output as downloadTicketPdf,
 * guaranteeing pixel-identical output to the downloaded PDF.
 */
export async function printTicketPdf(
  ticket: TicketDetailRow,
  role: UserRole,
): Promise<void> {
  const blob = await generatePdfBlob(ticket, role);
  const blobUrl = URL.createObjectURL(blob);

  // Open PDF in a new tab/window
  const printWindow = window.open(blobUrl, '_blank');

  if (!printWindow) {
    // Popup blocked — fall back to download
    console.warn('[PDF Print] Popup blocked, falling back to download');
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `WorkOrder-${ticket.ticket_number}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    throw new Error('POPUP_BLOCKED');
  }

  // Auto-trigger print once the PDF loads in the new tab.
  // Different browsers handle PDF blob loading differently:
  //   • Chrome/Edge: 'load' fires on the window
  //   • Firefox: may need a delay for the PDF viewer to initialize
  //   • Safari: 'load' works but needs focus() first
  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // Cross-origin or PDF viewer blocked print() — user can Ctrl+P
      console.warn('[PDF Print] Auto-print failed, user can use Ctrl+P');
    }
  };

  // Try onload first, with a timeout fallback
  printWindow.onload = () => {
    // Small delay for PDF viewer to fully render
    setTimeout(triggerPrint, 500);
  };

  // Fallback: if onload doesn't fire (some browsers with PDF blobs),
  // trigger after a reasonable delay
  setTimeout(() => {
    triggerPrint();
  }, 2000);

  // Clean up blob URL after a generous window (user may print slowly)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}
