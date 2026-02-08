export function Loading({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="loading-center">
      <div className="spinner spinner-lg" />
      <span>{message}</span>
    </div>
  );
}
