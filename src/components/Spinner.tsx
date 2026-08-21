interface SpinnerProps { label?: string }
export function Spinner({ label = 'Loading…' }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 gap-4">
      <div className="relative">
        <span className="text-5xl animate-chess-float inline-block select-none">♞</span>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-black/10 rounded-full animate-chess-shadow inline-block"/>
      </div>
      <p className="text-gray-400 text-sm animate-chess-pulse">{label}</p>
    </div>
  );
}
