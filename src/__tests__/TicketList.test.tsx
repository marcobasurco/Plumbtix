import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock supabaseClient before importing components
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          eq: () => ({ not: () => ({ data: [], error: null }), data: [], error: null }),
          data: [],
          error: null,
        }),
        eq: () => ({ data: [], error: null }),
        data: [],
        error: null,
      }),
    }),
    channel: () => ({
      on: () => ({ on: () => ({ subscribe: () => {} }) }),
      subscribe: () => {},
    }),
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    profile: null,
    role: 'proroto_admin',
    companyId: null,
    loading: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/lib/tickets', () => ({
  fetchTicketList: vi.fn().mockResolvedValue({ rows: [], count: 0 }),
  TICKET_PAGE_SIZE: 50,
  fetchBuildingOptions: vi.fn().mockResolvedValue([]),
  formatSpaceLabel: (s: { unit_number?: string | null }) => (s.unit_number ? `Unit ${s.unit_number}` : 'Common area'),
}));

describe('TicketList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the work orders heading', async () => {
    const { TicketList } = await import('@/components/tickets/TicketList');
    render(
      <MemoryRouter>
        <TicketList />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Work orders' })).toBeDefined();
  });

  it('shows empty state when there are no open work orders', async () => {
    const { TicketList } = await import('@/components/tickets/TicketList');
    render(
      <MemoryRouter>
        <TicketList />
      </MemoryRouter>
    );
    // Wait for loading to finish
    await screen.findByText('No open work orders');
    expect(screen.getByText('No open work orders')).toBeDefined();
  });
});
