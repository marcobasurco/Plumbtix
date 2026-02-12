// =============================================================================
// Work Orders — Notification Bell Component
// =============================================================================
// Shows a bell icon with unread count in the header.
// Subscribes to Supabase Realtime for live notification updates.
// Clicking opens a dropdown with recent notifications.
// =============================================================================

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { Bell, X, Check, Ticket, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticket_id: string | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'status_change':
      return <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />;
    case 'new_comment':
      return <MessageSquare className="h-4 w-4 text-green-500 shrink-0" />;
    case 'new_ticket':
      return <Ticket className="h-4 w-4 text-orange-500 shrink-0" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

export function NotificationBell() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!session) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data as NotificationRow[]);
      setUnreadCount(data.filter((n: NotificationRow) => !n.read_at).length);
    }
  }, [session]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'notifications' } as never,
        () => {
          fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
    fetchNotifications();
  };

  const handleNotificationClick = (notif: NotificationRow) => {
    if (!notif.read_at) markAsRead(notif.id);
    if (notif.ticket_id) {
      // Navigate to the ticket — the correct prefix will be resolved by the layout
      navigate(notif.ticket_id);
    }
    setOpen(false);
  };

  if (!session) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllAsRead}>
                  <Check className="h-3 w-3 mr-1" /> Mark all read
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Notification list */}
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div>
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left p-3 border-b border-border last:border-b-0 transition-colors hover:bg-muted/50 ${
                    !notif.read_at ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex gap-2.5">
                    <NotificationIcon type={notif.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm truncate ${!notif.read_at ? 'font-semibold' : ''}`}>
                          {notif.title}
                        </span>
                        {!notif.read_at && (
                          <Badge variant="info" className="text-[9px] px-1 py-0 shrink-0">New</Badge>
                        )}
                      </div>
                      {notif.body && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notif.body}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {timeAgo(notif.created_at)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
