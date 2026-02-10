// =============================================================================
// PlumbTix — Realtime Subscription Hooks
// =============================================================================
// Generic hook for subscribing to Postgres changes on any table.
// Uses Supabase Realtime (broadcast + postgres_changes).
//
// Usage:
//   useRealtime('tickets', refresh);                       // all changes
//   useRealtime('tickets', refresh, { column: 'status' }); // specific column
//   useRealtime('buildings', refresh, { filter: `company_id=eq.${companyId}` });
// =============================================================================

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeOptions {
  /** Postgres column-level filter (e.g. 'company_id=eq.xxx') */
  filter?: string;
  /** Only subscribe to specific events (default: all) */
  events?: Array<'INSERT' | 'UPDATE' | 'DELETE'>;
  /** Disable subscription (e.g. while loading) */
  enabled?: boolean;
}

/**
 * Subscribe to realtime changes on a Postgres table.
 * Calls `onChangeRef` whenever a matching change event fires.
 *
 * The callback is debounced (100ms) to prevent rapid re-renders
 * when multiple changes arrive in a burst.
 */
export function useRealtime(
  table: string,
  onChange: () => void,
  options: RealtimeOptions = {},
) {
  const { filter, events = ['INSERT', 'UPDATE', 'DELETE'], enabled = true } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store latest onChange in ref to avoid resubscribing on every render
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    const channelName = `realtime-${table}-${filter ?? 'all'}-${Date.now()}`;

    const channel = supabase.channel(channelName);

    for (const event of events) {
      const config: Record<string, unknown> = {
        event,
        schema: 'public',
        table,
      };
      if (filter) config.filter = filter;

      channel.on(
        'postgres_changes' as never,
        config as never,
        () => {
          // Debounce rapid changes
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            onChangeRef.current();
          }, 100);
        },
      );
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, enabled, events.join(',')]);
}

/**
 * Convenience hook for ticket-related realtime events.
 * Subscribes to tickets, ticket_comments, and ticket_attachments.
 */
export function useRealtimeTickets(onChange: () => void, enabled = true) {
  useRealtime('tickets', onChange, { enabled });
  useRealtime('ticket_comments', onChange, { enabled });
  useRealtime('ticket_attachments', onChange, { enabled });
}

/**
 * Convenience hook for building realtime events.
 * Subscribes to buildings, spaces, and occupants.
 */
export function useRealtimeBuildings(onChange: () => void, enabled = true) {
  useRealtime('buildings', onChange, { enabled });
  useRealtime('spaces', onChange, { enabled });
  useRealtime('occupants', onChange, { enabled });
}
