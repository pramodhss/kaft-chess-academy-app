export function Spinner({ size = 8 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div
        className={`w-${size} h-${size} border-4 border-chess-light border-t-navy rounded-full animate-spin`}
      />
    </div>
  );
}
