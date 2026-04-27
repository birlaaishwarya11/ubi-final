import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { t: string; score: number | null };

export function TrendChart({ data }: { data: Point[] }) {
  return (
    <div className="bg-card rounded-2xl ring-1 ring-line p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink">Immune activation score</h3>
        <span className="text-xs text-slate-500">last {data.length} windows</span>
      </div>
      <div className="h-56">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-slate-400 text-sm">
            No readings yet — pair your device to start streaming data.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#0ea5e9"
                strokeWidth={2}
                fill="url(#g)"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
