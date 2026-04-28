import { useReadings } from "../hooks/useReadings";

export function Live({ userId }: { userId: string }) {
  const { readings, loading } = useReadings(userId);

  return (
    <div className="bg-card rounded-2xl ring-1 ring-line overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Live readings</h3>
          <p className="text-xs text-slate-500">
            Newest at the top · updates in real time as the device streams
          </p>
        </div>
        <span className="text-xs text-slate-500">{readings.length} rows</span>
      </div>
      {loading ? (
        <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
      ) : readings.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">
          No readings yet — start sensing from the Overview tab and wait one window.
        </div>
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
                  <Td>
                    {r.inference?.risk_label === undefined
                      ? "—"
                      : r.inference.risk_label === 1
                      ? <span className="text-bad font-medium">Inflamed</span>
                      : <span className="text-good">Normal</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : (typeof v === "number" ? v.toFixed(1) : String(v));

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-2 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2 text-ink whitespace-nowrap">{children}</td>;
}
