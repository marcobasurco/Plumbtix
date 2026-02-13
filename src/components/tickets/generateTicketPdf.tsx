// =============================================================================
// PlumbTix — PDF Download Helper
// =============================================================================
// Fetches ticket supporting data, renders TicketPdfDocument via
// @react-pdf/renderer, and triggers a browser download.
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
 * Generate and download a PDF for a ticket.
 * Uses @react-pdf/renderer for crisp vector output.
 */
export async function downloadTicketPdf(
  ticket: TicketDetailRow,
  role: UserRole,
): Promise<void> {

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
  const blob = await pdf(
    <TicketPdfDocument ticket={ticket} userRole={role} data={pdfData} />
  ).toBlob();

  // ── 4. Trigger browser download ──
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `WorkOrder-${ticket.ticket_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
