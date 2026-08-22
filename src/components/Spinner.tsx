interface SpinnerProps { readonly label?: string }

export function Spinner({ label }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[240px] px-8 py-16 gap-4" role="status" aria-live="polite">
      <div className="chess-loader" aria-hidden="true">
        {['♜', '♞', '♝', '♛'].map((piece, index) => (
          <span key={piece} style={{ animationDelay: `${index * 140}ms` }}>{piece}</span>
        ))}
      </div>
      <div className="text-center">
        <p className="text-navy font-semibold text-sm">{label ?? 'Loading academy data'}</p>
        <div className="chess-loader-dots mt-2" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
