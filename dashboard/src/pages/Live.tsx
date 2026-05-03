import type { useActiveSession } from "../hooks/useActiveSession";
import type { useReadings } from "../hooks/useReadings";

type ReadingsState = ReturnType<typeof useReadings>;
type ActiveState = ReturnType<typeof useActiveSession>;

export function Live({
  readingsState,
  activeState,
}: {
  readingsState: ReadingsState;
  activeState: ActiveState;
}) {
  const { readings, loading: readingsLoading } = readingsState;
  const { session, mine, loading: sessionLoading } = activeState;

  const heldByOther = !!session && !mine;

  return (
    <div className="bg-card rounded-2xl ring-1 ring-line overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Live readings</h3>
          <p className="text-xs text-slate-500 truncate">
            Newest at the top · updates in real time as the device streams
          </p>
        </div>
        <span className="text-xs text-slate-500 shrink-0">{readings.length} rows</span>
      </div>

      {sessionLoading || readingsLoading ? (
        <Empty kind="loading" />
      ) : !mine && readings.length === 0 ? (
        <Empty
          kind="idle"
          title={heldByOther ? "Device claimed by another user" : "Device not streaming"}
          body={
            heldByOther
              ? "Click "Take over" above to redirect the stream to your account."
              : "Click "Start sensing" above to claim the device. New windows will appear here every 30 seconds."
          }
        />
      ) : mine && readings.length === 0 ? (
        <Empty
          kind="waiting"
          title="Device claimed — waiting for first window"
          body="Streaming has started for your account. The first reading should arrive within ~30 seconds."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <Th>Window start</Th>
                <Th>HR (bpm)</Th>
                <Th>HRV (ms)</Th>
                <Th>Temp (°C)</Th>
                <Th>EDA (μS)</Th>
                <Th>Score</Th>
                <Th>Risk</Th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.window_id} className="border-t border-line hover:bg-slate-50">
                  <Td>{new Date(r.window_start).toLocaleTimeString()}</Td>
                  <Td>{fmt(r.heart_rate_bpm)}</Td>
                  <Td>{fmt(r.hrv_ms)}</Td>
                  <Td>{fmt(r.skin_temp_c)}</Td>
                  <Td>{fmt(r.eda_microsiemens)}</Td>
                  <Td>{fmt(r.inference?.immune_score)}</Td>
                  <Td>{riskCell(r.inference?.risk_label)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty({
  kind,
  title,
  body,
}: {
  kind: "loading" | "idle" | "waiting";
  title?: string;
  body?: string;
}) {
  if (kind === "loading") {
    return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  }
  const dot = kind === "waiting" ? "bg-good" : "bg-slate-300";
  return (
    <div className="p-10 text-center">
      <div className="inline-flex items-center gap-2 text-sm font-medium text-ink">
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`}>
          {kind === "waiting" && (
            <span className="absolute inset-0 rounded-full bg-good opacity-60 animate-ping" />
          )}
        </span>
        <span>{title}</span>
      </div>
      <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">{body}</p>
    </div>
  );
}

function riskCell(label: 0 | 1 | undefined | null) {
  if (label == null) return <span className="text-slate-400">—</span>;
  return label === 1 ? (
    <span className="text-bad font-medium">Inflamed</span>
  ) : (
    <span className="text-good">Normal</span>
  );
}

const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-2 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2 text-ink whitespace-nowrap">{children}</td>;
}
