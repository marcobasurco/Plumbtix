// =============================================================================
// On-call — who gets paged while an emergency is unacknowledged
// =============================================================================
// Pro Roto admins only. The roster is an ordered list; each person gets
// `wait_minutes` to acknowledge before the next one is texted and called.
// After two full rounds with no response, everyone is emailed and the work
// order is flagged "No response".
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import {
  fetchOnCallRoster, addToOnCall, updateOnCall, removeFromOnCall, fetchProRotoAdmins, fetchUnacknowledgedEmergencies,
  type OnCallRow,
} from '@/lib/oncall';
import { useRealtimeTickets } from '@/hooks/useRealtime';
import { PageTransition } from '@/components/PageTransition';
import { ErrorBanner, friendlyError } from '@/components/ErrorBanner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Siren, ArrowUp, ArrowDown, X, UserPlus, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { formatPhone } from '@shared/phone';

type Admin = { id: string; full_name: string; email: string; phone: string | null };
type Unacked = Awaited<ReturnType<typeof fetchUnacknowledgedEmergencies>>[number];

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function OnCallPage() {
  const { role } = useAuth();
  const [roster, setRoster] = useState<OnCallRow[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [unacked, setUnacked] = useState<Unacked[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<OnCallRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, a, u] = await Promise.all([fetchOnCallRoster(), fetchProRotoAdmins(), fetchUnacknowledgedEmergencies()]);
      setRoster(r); setAdmins(a); setUnacked(u);
    } catch (e) {
      setError(friendlyError(e, "Couldn't load the on-call roster."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeTickets(load, !loading);

  if (role !== 'proroto_admin') return null;

  const onRoster = new Set(roster.map((r) => r.user_id));
  const candidates = admins.filter((a) => !onRoster.has(a.id));

  const run = async (key: string, fn: () => Promise<void>, okMsg?: string) => {
    setBusy(key);
    try { await fn(); if (okMsg) toast.success(okMsg); await load(); }
    catch (e) { toast.error(friendlyError(e, 'Change failed.')); }
    finally { setBusy(null); }
  };

  const move = (index: number, dir: -1 | 1) => {
    const other = index + dir;
    if (other < 0 || other >= roster.length) return;
    const a = roster[index], b = roster[other];
    // Positions are just an order; swap them and renumber the pair.
    run(`move-${a.id}`, async () => {
      await updateOnCall(a.id, { position: other + 1 });
      await updateOnCall(b.id, { position: index + 1 });
    });
  };

  const add = () => {
    if (!addUserId) return;
    const who = admins.find((a) => a.id === addUserId);
    run('add', async () => { await addToOnCall(addUserId, roster.length + 1); setAddUserId(''); }, `${who?.full_name ?? 'Added'} is on call`);
  };

  return (
    <PageTransition>
      <div className="page-title-bar">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">On-call</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            While an emergency is unacknowledged, these people are texted and called in order. Tapping "I'm on it" on the work order stops the paging.
          </p>
        </div>
      </div>

      <ErrorBanner message={error} onRetry={load} onDismiss={() => setError(null)} />

      {/* Live: what is burning right now */}
      {unacked.length > 0 && (
        <div role="alert" className="mb-5 rounded-lg border-2 border-destructive bg-destructive/5 p-4">
          <div className="flex items-center gap-2 font-bold text-destructive mb-2">
            <Siren className="h-5 w-5" aria-hidden="true" /> {unacked.length} emergenc{unacked.length === 1 ? 'y' : 'ies'} waiting for someone
          </div>
          <ul className="m-0 p-0 list-none divide-y divide-destructive/20">
            {unacked.map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <strong>#{t.ticket_number}</strong> · {t.building?.name || t.building?.address_line1} · open {minutesSince(t.created_at)} min
                  {t.escalation_exhausted_at ? ' · no response after ' + t.escalation_step + ' pages' : t.escalation_step > 0 ? ` · paged ${t.escalation_step}×` : ''}
                </span>
                <Button asChild size="sm" variant="destructive" className="shrink-0"><Link to={`/admin/tickets/${t.id}`}>Open</Link></Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Paging order</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {roster.length === 0 ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <PhoneOff className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  <p className="m-0"><strong>Nobody is on call.</strong> Emergencies still email and text every Pro Roto admin once, but no one is paged again if it goes unanswered. Add at least one person.</p>
                </div>
              ) : (
                <ol className="m-0 p-0 list-none divide-y divide-border">
                  {roster.map((r, i) => (
                    <li key={r.id} className={`py-3 flex items-center gap-3 flex-wrap ${r.active ? '' : 'opacity-60'}`}>
                      <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full bg-muted text-sm font-bold flex items-center justify-center">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{r.user?.full_name ?? 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.user?.phone ? formatPhone(r.user.phone) : <span className="text-destructive font-medium">No phone on file — can't be called</span>}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Wait</span>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={r.wait_minutes}
                          aria-label={`Minutes before paging the next person after ${r.user?.full_name ?? 'this person'}`}
                          className="form-input w-20 text-center"
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(120, Number(e.target.value) || 1));
                            setRoster((prev) => prev.map((x) => x.id === r.id ? { ...x, wait_minutes: v } : x));
                          }}
                          onBlur={(e) => {
                            const v = Math.max(1, Math.min(120, Number(e.target.value) || 1));
                            run(`wait-${r.id}`, () => updateOnCall(r.id, { wait_minutes: v }));
                          }}
                        />
                        <span className="text-muted-foreground">min</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={r.active} onCheckedChange={(v: boolean) => run(`active-${r.id}`, () => updateOnCall(r.id, { active: v }))} aria-label={`${r.user?.full_name ?? 'This person'} on call`} />
                        <span className="text-muted-foreground">{r.active ? 'On' : 'Off'}</span>
                      </label>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-10 w-10 p-0" aria-label="Move up" disabled={i === 0 || busy !== null} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                        <Button variant="ghost" size="sm" className="h-10 w-10 p-0" aria-label="Move down" disabled={i === roster.length - 1 || busy !== null} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                        <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${r.user?.full_name ?? ''} from on-call`} disabled={busy !== null} onClick={() => setRemoveTarget(r)}><X className="h-4 w-4" aria-hidden="true" /></Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {candidates.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="oncall-add" className="form-label">Add someone</label>
                    <select id="oncall-add" className="form-select" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
                      <option value="">Choose a Pro Roto admin…</option>
                      {candidates.map((a) => <option key={a.id} value={a.id}>{a.full_name}{a.phone ? '' : ' (no phone)'}</option>)}
                    </select>
                  </div>
                  <Button onClick={add} disabled={!addUserId || busy !== null} className="min-h-[44px]">
                    <UserPlus className="h-4 w-4" aria-hidden="true" /> Add to on-call
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            How it works: a new emergency texts and emails every Pro Roto admin right away. If nobody acknowledges within the first person's wait time, that person is texted <em>and called</em>; then the next, and so on — twice through the list. After that, everyone is emailed and the work order shows "No response". Phone numbers come from each person's profile.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title="Remove from on-call?"
        description={removeTarget ? `${removeTarget.user?.full_name ?? 'This person'} will no longer be paged for unacknowledged emergencies.` : ''}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => { const t = removeTarget; setRemoveTarget(null); if (t) run(`remove-${t.id}`, () => removeFromOnCall(t.id), 'Removed'); }}
      />
    </PageTransition>
  );
}
