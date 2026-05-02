// Visible at the top of every client file. The first thing she sees.
// Designed to be a soft warning — not alarming, but unmissable.
export function SensitivityFlags({
  sensitivities,
}: {
  sensitivities: string[];
}) {
  if (!sensitivities || sensitivities.length === 0) return null;

  return (
    <div
      role="alert"
      className="border border-amber-200 bg-amber-50/70 rounded-md p-3 mb-3 flex items-start gap-3"
    >
      <svg
        className="w-4 h-4 text-amber-700 mt-0.5 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-1">
          Hold gently
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sensitivities.map((s) => (
            <span
              key={s}
              className="chip bg-white text-amber-800 border border-amber-200"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
