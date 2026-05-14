type Props = {
  score: number | null;
  label: 0 | 1 | null;
  lastSeen: string | null;
  qualityFlag: number | null;
  windowCount: number;
  hasBaseline: boolean;
};

export function StatusCard({
  score,
  label,
  lastSeen,
  qualityFlag,
  windowCount,
  hasBaseline,
}: Props) {
  const tier =
    score == null ? "unknown" : score >= 60 ? "high" : score >= 30 ? "med" : "low";

  const palette = {
    unknown: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-200", word: "No data" },
    low:     { bg: "bg-good/10",   text: "text-good",      ring: "ring-good/20",   word: "Normal" },
    med:     { bg: "bg-warn/10",   text: "text-warn",      ring: "ring-warn/20",   word: "Elevated" },
    high:    { bg: "bg-bad/10",    text: "text-bad",       ring: "ring-bad/20",    word: "Inflamed" },
  }[tier];

  const poorSignal = qualityFlag != null && qualityFlag !== 1;
  const signalBits: string[] = [];
  if (qualityFlag != null && qualityFlag !== 1) {
    if (qualityFlag & 1)  signalBits.push("motion detected");
    if (qualityFlag & 2)  signalBits.push("poor PPG");
    if (qualityFlag & 4)  signalBits.push("low ECG signal");
    if (qualityFlag & 8)  signalBits.push("temp out of range");
    if (qualityFlag === 0) signalBits.push("incomplete sensor data");
  }

  const confidence: "low" | "medium" | "high" =
    windowCount === 0 ? "low"
    : windowCount < 10 ? "low"
    : windowCount < 40 ? "medium"
    : "high";

  const confidenceLabel = {
    low:    "Low confidence",
    medium: "Medium confidence",
    high:   "High confidence",
  }[confidence];

  const confidenceColor = {
    low:    "text-bad",
    medium: "text-warn",
    high:   "text-good",
  }[confidence];

  return (
    <div className={`rounded-2xl ${palette.bg} ring-1 ${palette.ring} p-6 sm:p-8`}>

      {poorSignal && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-bad/10 ring-1 ring-bad/20 px-4 py-3">
          <WarningIcon />
          <div>
            <p className="text-sm font-medium text-bad">Poor signal quality</p>
            {signalBits.length > 0 && (
              <p className="text-xs text-bad/80 mt-0.5">{signalBits.join(" · ")}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              The risk score may not reflect your true physiological state. Check sensor contact and try again.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Inflammation status
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
          Model classification:{" "}
          <span className="font-medium">{label === 1 ? "Inflamed" : "Normal"}</span>
        </div>
      )}

      <div className="mt-5 border-t border-black/5" />

      <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Confidence</span>
          <span className={`text-xs font-medium ${confidenceColor}`}>
            {confidenceLabel}
          </span>
          <span className="text-xs text-slate-400">
            · based on {windowCount} window{windowCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              hasBaseline ? "bg-good" : "bg-warn animate-pulse"
            }`}
          />
          <span className="text-xs text-slate-500">
            {hasBaseline
              ? "Personal baseline established"
              : "Baseline pending — using population reference"}
          </span>
        </div>
      </div>

      {score != null && (
        <p className="mt-3 text-xs text-slate-500">
          {!hasBaseline
            ? "Scores are compared against the JHMC population dataset until your personal baseline is complete."
            : confidence === "low"
            ? "Not enough windows yet to detect a sustained trend. Keep the device on."
            : "Score reflects deviation from your personal baseline across recent windows."}
        </p>
      )}
    </div>
  );
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4 text-bad shrink-0 mt-0.5"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
