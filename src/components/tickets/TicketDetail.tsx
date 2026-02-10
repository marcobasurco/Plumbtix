// =============================================================================
// Work Orders — Ticket Detail Page (v0.3.0 Polish)
// =============================================================================
// Full ticket view with info cards, status timeline, comments, attachments,
// and action panel. Uses shadcn/ui components + Tailwind for consistency.
// Mobile-responsive: stacks to single column on small screens.
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
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
import type { TicketStatus } from '@shared/types/enums';
import { useRealtime } from '@/hooks/useRealtime';
import {
  ChevronLeft, FileText, MapPin, Wrench, Calendar,
  User, Phone, KeyRound, Clock,
} from 'lucide-react';

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
  const { role } = useAuth();
  const isAdmin = role === 'proroto_admin';

  const [ticket, setTicket] = useState<TicketDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1" onClick={() => navigate('..')}>
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
        <div className="flex gap-2 items-center">
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
    </PageTransition>
  );
}
