// =============================================================================
// Work Orders — Toast (sonner shim)
// =============================================================================
// Backward-compatible wrapper: existing code uses useToast().toast(msg, variant)
// while new code can import { toast } from 'sonner' directly.
// The Sonner <Toaster /> is mounted in App.tsx.
// =============================================================================

import { toast as sonnerToast } from 'sonner';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// useToast — drop-in replacement for the old context-based API
// ---------------------------------------------------------------------------

export function useToast() {
  return {
    toast: (message: string, variant?: 'success' | 'error' | 'info') => {
      switch (variant) {
        case 'error':
          sonnerToast.error(message);
          break;
        case 'info':
          sonnerToast.info(message);
          break;
        default:
          sonnerToast.success(message);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// ToastProvider — kept as a passthrough so App.tsx doesn't need restructuring
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
