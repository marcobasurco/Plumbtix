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
  fetchTicketList: vi.fn().mockResolvedValue([]),
  fetchBuildingOptions: vi.fn().mockResolvedValue([]),
}));

describe('TicketList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the tickets heading', async () => {
    const { TicketList } = await import('@/components/tickets/TicketList');
    render(
      <MemoryRouter>
        <TicketList />
      </MemoryRouter>
    );
    expect(screen.getByText('Tickets')).toBeDefined();
  });

  it('shows empty state when no tickets', async () => {
    const { TicketList } = await import('@/components/tickets/TicketList');
    render(
      <MemoryRouter>
        <TicketList />
      </MemoryRouter>
    );
    // Wait for loading to finish
    await screen.findByText('No tickets found');
    expect(screen.getByText('No tickets found')).toBeDefined();
  });
});
