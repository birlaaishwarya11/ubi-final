type Props = { score: number | null; label: 0 | 1 | null; lastSeen: string | null };

export function StatusCard({ score, label, lastSeen }: Props) {
  const tier =
    score == null ? "unknown" : score >= 60 ? "high" : score >= 30 ? "med" : "low";

  const palette = {
    unknown: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-200", word: "No data" },
    low:     { bg: "bg-good/10",  text: "text-good",     ring: "ring-good/20",   word: "Normal" },
    med:     { bg: "bg-warn/10",  text: "text-warn",     ring: "ring-warn/20",   word: "Elevated" },
    high:    { bg: "bg-bad/10",   text: "text-bad",      ring: "ring-bad/20",    word: "Inflamed" },
  }[tier];

  return (
    <div className={`rounded-2xl ${palette.bg} ring-1 ${palette.ring} p-6 sm:p-8`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Inflammation Status
          </p>
          <p className={`text-4xl sm:text-5xl font-bold mt-2 ${palette.text}`}>
            {palette.word}
          </p>
          {lastSeen && (
            <p className="text-xs text-slate-500 mt-3">
              Updated {new Date(lastSeen).toLocaleTimeString()} · {new Date(lastSeen).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Score</p>
          <p className={`text-5xl sm:text-6xl font-bold ${palette.text}`}>
            {score == null ? "—" : score.toFixed(0)}
          </p>
          <p className="text-xs text-slate-500">/100</p>
        </div>
      </div>
      {label != null && (
        <div className="mt-4 text-sm text-slate-600">
          Model classification: <span className="font-medium">{label === 1 ? "Inflamed" : "Normal"}</span>
        </div>
      )}
    </div>
  );
}
