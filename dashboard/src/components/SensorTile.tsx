type Props = {
  label: string;
  value: number | null;
  unit: string;
  baseline?: number | null;
  icon: "heart" | "wave" | "thermo" | "spark";
};

export function SensorTile({ label, value, unit, baseline, icon }: Props) {
  const delta =
    value != null && baseline != null && baseline !== 0
      ? ((value - baseline) / baseline) * 100
      : null;

  return (
    <div className="bg-card rounded-2xl ring-1 ring-line p-5">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon kind={icon} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-ink">
          {value == null ? "—" : value.toFixed(1)}
        </span>
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
      {delta != null && (
        <p className={`text-xs mt-1 ${delta > 5 ? "text-bad" : delta < -5 ? "text-accent" : "text-slate-500"}`}>
          {delta > 0 ? "+" : ""}
          {delta.toFixed(0)}% vs baseline
        </p>
      )}
    </div>
  );
}

function Icon({ kind }: { kind: Props["icon"] }) {
  const common = "w-4 h-4";
  if (kind === "heart")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={common}>
        <path d="M12 21s-7-4.5-9.5-9.5C.5 6 6 2 12 6c6-4 11.5 0 9.5 5.5C19 16.5 12 21 12 21z" />
      </svg>
    );
  if (kind === "wave")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M3 12h3l2-5 4 10 2-5h7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (kind === "thermo")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M14 14V5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
