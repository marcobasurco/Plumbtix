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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Smartphone, Shield, Info } from 'lucide-react';

// E.164 validation: + followed by 1–15 digits
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Normalize common US phone formats to E.164.
 * Returns the input as-is if already E.164, or attempts US normalization.
 */
function normalizePhoneInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Already E.164
  if (E164_REGEX.test(trimmed)) return trimmed;

  // Strip non-digits
  const digits = trimmed.replace(/\D/g, '');

  // 10-digit US
  if (digits.length === 10) return `+1${digits}`;

  // 11-digit starting with 1
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // Anything else: return as-is and let validation catch it
  return trimmed;
}

function formatPhoneDisplay(e164: string): string {
  if (!e164) return '';
  // Format +1XXXXXXXXXX as (XXX) XXX-XXXX
  const match = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (match) return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
  return e164;
}

export function SettingsPage() {
  const { profile, role, refreshProfile } = useAuth();

  const [phone, setPhone] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Sync from profile
  useEffect(() => {
    if (profile) {
      setPhone(profile.phone || '');
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
    const normalized = normalizePhoneInput(value);
    if (!E164_REGEX.test(normalized)) {
      setPhoneError('Enter a valid phone number (e.g. +16505551234 or (650) 555-1234)');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSave = async () => {
    if (!profile) return;

    const normalizedPhone = phone.trim() ? normalizePhoneInput(phone) : null;

    // Validate if phone is provided
    if (normalizedPhone && !E164_REGEX.test(normalizedPhone)) {
      setPhoneError('Enter a valid phone number (e.g. +16505551234 or (650) 555-1234)');
      return;
    }

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
      setPhone(normalizedPhone ?? '');
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
    (phone.trim() ? normalizePhoneInput(phone) : null) !== (profile?.phone || null) ||
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
                {role === 'proroto_admin' ? 'Pro Roto Admin' :
                 role === 'pm_admin' ? 'Property Manager' :
                 role === 'pm_user' ? 'PM User' :
                 'Resident'}
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
            <Label htmlFor="phone">Phone Number</Label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (650) 555-1234"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  onBlur={() => validatePhone(phone)}
                  className={phoneError ? 'border-destructive' : ''}
                />
                {phoneError && (
                  <p className="text-xs text-destructive mt-1">{phoneError}</p>
                )}
              </div>
            </div>
            {phone && !phoneError && E164_REGEX.test(normalizePhoneInput(phone)) && (
              <p className="text-xs text-muted-foreground">
                Stored as: {formatPhoneDisplay(normalizePhoneInput(phone))}
              </p>
            )}
          </div>

          {/* SMS Toggle — role-dependent */}
          {isResident && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="sms-toggle" className="text-sm font-medium">
                  Receive SMS updates for my tickets
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
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-4">
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
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
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4">
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    Admin SMS
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    SMS notifications for Pro Roto admins are managed via the
                    PROROTO_EMERGENCY_EMAILS environment variable. Add your phone
                    number here for future SMS features.
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
