// =============================================================================
// Work Orders — Technicians Roster (Pro Roto Admin Only)
// =============================================================================
// Manage the field crew (migration 00023): add technicians, edit contact
// info, and activate/deactivate. Deactivated techs disappear from the
// assignment dropdown but keep their history on past tickets.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  fetchTechnicians,
  createTechnician,
  updateTechnician,
} from '@/lib/technicians';
import type { Technician } from '@shared/types/database';
import { PageTransition } from '@/components/PageTransition';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Loader2, HardHat, Phone, Mail, Pencil, X } from 'lucide-react';

export function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTechnicians(await fetchTechnicians(false)); // include inactive
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load technicians');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await createTechnician({ name, phone, email });
      toast.success(`${name.trim()} added to the roster`);
      setName(''); setPhone(''); setEmail(''); setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add technician');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t: Technician) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditPhone(t.phone ?? '');
    setEditEmail(t.email ?? '');
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    if (!editName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await updateTechnician(editingId, { name: editName, phone: editPhone, email: editEmail });
      toast.success('Technician updated');
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update technician');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t: Technician) => {
    setTogglingId(t.id);
    try {
      await updateTechnician(t.id, { active: !t.active });
      toast.success(t.active
        ? `${t.name} deactivated — hidden from assignment, history kept`
        : `${t.name} reactivated`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update technician');
    } finally {
      setTogglingId(null);
    }
  };

  const inputCls = 'w-full';

  return (
    <PageTransition>
      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Technicians</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pro Roto field crew — used for ticket assignment
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> Add Technician</>}
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">New Technician</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="techName">Name <span className="text-destructive">*</span></Label>
                <Input id="techName" className={inputCls} placeholder="e.g. Bryan Alvarez"
                  value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="techPhone">Phone</Label>
                <Input id="techPhone" className={inputCls} placeholder="(650) 555-0100"
                  value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="techEmail">Email</Label>
                <Input id="techEmail" className={inputCls} type="email" placeholder="bryan@proroto.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <Button size="sm" className="mt-3" onClick={handleAdd} disabled={saving}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Add to Roster'}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : technicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <HardHat className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <div className="text-base font-semibold mb-1">No technicians yet</div>
          <div className="text-sm text-muted-foreground max-w-sm">
            Add your field crew to assign them to work orders from a dropdown.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {technicians.map((t) => (
            <div key={t.id}
              className={`rounded-lg border border-border bg-card p-4 ${!t.active ? 'opacity-60' : ''}`}>
              {editingId === t.id ? (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                    <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" />
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" type="email" />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={handleEditSave} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t.name}</span>
                      {!t.active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                      {t.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{t.phone}</span>}
                      {t.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{t.email}</span>}
                      {!t.phone && !t.email && <span>No contact info</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant={t.active ? 'outline' : 'default'}
                      onClick={() => handleToggleActive(t)} disabled={togglingId === t.id}>
                      {togglingId === t.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : t.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
