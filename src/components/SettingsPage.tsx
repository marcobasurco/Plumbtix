// =============================================================================
// PlumbTix — Settings Page
// =============================================================================
// Profile & SMS notification preferences. All roles can access.
// - Phone number input with E.164 validation
// - SMS toggle (residents: opt-in; PMs: always receive emergency alerts)
// =============================================================================

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Smartphone, Shield, Info } from 'lucide-react';
import { ROLE_LABELS } from '@shared/types/enums';
import { normalizePhone, formatPhone, isValidPhone, PHONE_ERROR } from '@shared/phone';
import { PhoneInput } from '@/components/ui/phone-input';

export function SettingsPage() {
  const { profile, role, refreshProfile } = useAuth();

  const [phone, setPhone] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Sync from profile
  useEffect(() => {
    if (profile) {
      setPhone(formatPhone(profile.phone));
      setSmsEnabled(profile.sms_notifications_enabled ?? false);
    }
  }, [profile]);

  const isResident = role === 'resident';
  const isPM = role === 'pm_admin' || role === 'pm_user';
  const isAdmin = role === 'proroto_admin';

  // Auto-disable SMS toggle when phone is cleared
  const handlePhoneChange = (value: string) => {
    setPhone(value);
    if (phoneError) validatePhone(value);
    if (!value.trim() && smsEnabled) {
      setSmsEnabled(false);
    }
  };

  const validatePhone = (value: string): boolean => {
    if (!value.trim()) {
      setPhoneError('');
      return true; // Phone is optional
    }
    if (!isValidPhone(value)) {
      setPhoneError(PHONE_ERROR);
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSave = async () => {
    if (!profile) return;

    if (!isValidPhone(phone)) {
      setPhoneError(PHONE_ERROR);
      return;
    }
    const normalizedPhone = normalizePhone(phone);

    // Force SMS off if no phone
    const effectiveSmsEnabled = normalizedPhone ? smsEnabled : false;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          phone: normalizedPhone,
          sms_notifications_enabled: effectiveSmsEnabled,
        })
        .eq('id', profile.id);

      if (error) {
        console.error('[settings] Save failed:', error.message);
        toast.error('Failed to save settings', { description: error.message });
        return;
      }

      // Sync local state to what was actually saved
      setPhone(formatPhone(normalizedPhone));
      setSmsEnabled(effectiveSmsEnabled);

      toast.success('Settings saved');
      await refreshProfile();
    } catch (e) {
      console.error('[settings] Unexpected error:', e);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Check if anything changed
  const hasChanges =
    normalizePhone(phone) !== (profile?.phone || null) ||
    smsEnabled !== (profile?.sms_notifications_enabled ?? false);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Info (read-only summary) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            Account
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
            <span className="text-muted-foreground font-medium">Name</span>
            <span>{profile?.full_name ?? '—'}</span>
            <span className="text-muted-foreground font-medium">Email</span>
            <span>{profile?.email ?? '—'}</span>
            <span className="text-muted-foreground font-medium">Role</span>
            <span>
              <Badge variant="secondary" className="text-xs">
                {role ? ROLE_LABELS[role] : '—'}
              </Badge>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* SMS Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            SMS Notifications
          </CardTitle>
          <CardDescription>
            Receive text message alerts for urgent work order updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Phone Number */}
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile number</Label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={handlePhoneChange}
                  onBlur={() => validatePhone(phone)}
                  className={phoneError ? 'border-destructive' : ''}
                />
                {phoneError && (
                  <p className="text-xs text-destructive mt-1">{phoneError}</p>
                )}
              </div>
            </div>
            {phone && !phoneError && normalizePhone(phone) && (
              <p className="text-xs text-muted-foreground">
                Texts and calls go to {formatPhone(phone)}.
              </p>
            )}
          </div>

          {/* SMS Toggle — role-dependent */}
          {isResident && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="sms-toggle" className="text-sm font-medium">
                  Text me when my work orders change
                </Label>
                <p className="text-xs text-muted-foreground">
                  Get a text when your work order is completed or updated
                </p>
              </div>
              <Switch
                id="sms-toggle"
                checked={smsEnabled}
                onCheckedChange={setSmsEnabled}
                disabled={!phone.trim()}
              />
            </div>
          )}

          {isPM && (
            <div className="rounded-lg tone-info tone-notice p-4">
              <div className="flex gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Emergency alerts always enabled
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    As a property manager, you automatically receive SMS alerts for
                    emergency work orders at your buildings — no opt-in required.
                    Just add your phone number above.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="rounded-lg tone-info tone-notice p-4">
              <div className="flex gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Emergency alerts enabled
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    As a Pro Roto admin, you automatically receive SMS alerts for
                    all emergency work orders. Just add your phone number above.
                    You can also manage phone numbers for PM users from the Users page.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disabled toggle hint when no phone */}
          {isResident && !phone.trim() && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Add a phone number to enable SMS notifications
            </p>
          )}

          {/* Save */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges || !!phoneError}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
