// =============================================================================
// Emergency banner — acknowledgement state on an emergency work order
// =============================================================================
// Pro Roto admin, unacknowledged:  one big "I'm on it" button. Nothing else on
//                                  the page matters until this is tapped.
// Pro Roto admin, acknowledged:    who took it and when.
// PM / resident, unacknowledged:   "Pro Roto has been paged" — and that they'll
//                                  be told when someone picks it up.
// PM / resident, acknowledged:     "<name> is on it".
// =============================================================================

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { acknowledgeEmergency } from '@/lib/api';
import { friendlyError } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Siren, Check, Loader2, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  ticketId: string;
  status: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  escalationStep: number;
  nextEscalationAt: string | null;
  exhaustedAt: string | null;
  createdAt: string;
  onChanged: () => void;
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function minutesUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

export function EmergencyBanner({
  ticketId, status, acknowledgedAt, acknowledgedByName, escalationStep, nextEscalationAt, exhaustedAt, createdAt, onChanged,
}: Props) {
  const { role } = useAuth();
  const isAdmin = role === 'proroto_admin';
  const [busy, setBusy] = useState(false);
  const closed = ['completed', 'invoiced', 'cancelled'].includes(status);

  if (closed && !acknowledgedAt) return null;

  const acknowledge = async () => {
    setBusy(true);
    const res = await acknowledgeEmergency(ticketId);
    setBusy(false);
    if (!res.ok) { toast.error(friendlyError(new Error(res.error.message), "Couldn't acknowledge.")); return; }
    if (res.data.already) toast.info(`${res.data.acknowledged_by ?? 'Someone'} already has this one.`);
    else toast.success("You're on it. The reporter has been told.");
    onChanged();
  };

  // ── Acknowledged ──────────────────────────────────────────────────────
  if (acknowledgedAt) {
    return (
      <div role="status" className="mb-5 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-900/20 dark:text-green-200">
        <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          <strong>{acknowledgedByName ?? 'Pro Roto'}</strong> is on it — acknowledged at {timeOnly(acknowledgedAt)}.
        </span>
      </div>
    );
  }

  // ── Unacknowledged ────────────────────────────────────────────────────
  const openFor = minutesSince(createdAt);

  if (isAdmin) {
    return (
      <div role="alert" className="mb-5 rounded-lg border-2 border-destructive bg-destructive/5 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Siren className="h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />
            <div className="text-sm">
              <div className="font-bold text-destructive">Emergency — nobody has acknowledged this yet</div>
              <div className="text-muted-foreground mt-0.5">
                Open for {openFor} min.
                {exhaustedAt
                  ? ` The on-call roster was paged ${escalationStep} times with no response — pick it up or call the office.`
                  : escalationStep > 0
                    ? ` On-call paged ${escalationStep} time${escalationStep === 1 ? '' : 's'} by text and phone.`
                    : ''}
                {nextEscalationAt && !exhaustedAt && ` Next page in ${minutesUntil(nextEscalationAt)} min.`}
              </div>
            </div>
          </div>
          <Button size="lg" variant="destructive" className="w-full sm:w-auto min-w-[180px]" onClick={acknowledge} disabled={busy}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
            I'm on it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
      <PhoneCall className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <span>
        <strong>Pro Roto has been paged.</strong> You'll be told the moment someone picks this up.
        {openFor >= 15 && " If you haven't heard back, call the office."}
      </span>
    </div>
  );
}
