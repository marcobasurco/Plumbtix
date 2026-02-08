// Minimal loading indicator. Replace with a real spinner later.
export function Loading({ message = 'Loading…' }: { message?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <p style={{ fontSize: '1.1rem', color: '#666' }}>{message}</p>
    </div>
  );
}
