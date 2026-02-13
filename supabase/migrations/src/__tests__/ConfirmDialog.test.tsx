import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and description when open', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Confirm Action"
        description="Are you sure you want to proceed?"
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText('Confirm Action')).toBeDefined();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeDefined();
  });

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Test"
        description="Test desc"
        confirmLabel="Yes, send"
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByText('Yes, send'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('does not render content when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Hidden"
        description="Should not show"
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
