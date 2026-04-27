import type { Session } from "@supabase/supabase-js";
import { Header } from "../components/Header";
import { SensorTile } from "../components/SensorTile";
import { StatusCard } from "../components/StatusCard";
import { TrendChart } from "../components/TrendChart";
import { useReadings } from "../hooks/useReadings";
import type { Profile } from "../lib/supabase";

export function Dashboard({ session, profile }: { session: Session; profile: Profile }) {
  const userId = session.user.id;
  const { readings, baseline, loading } = useReadings(userId);

  const latest = readings[0];
  const latestInf = latest?.inference;

  const trend = [...readings]
    .reverse()
    .map((r) => ({
      t: new Date(r.window_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      score: r.inference?.immune_score ?? null,
    }));

  const age =
    new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear();

  return (
    <div className="min-h-screen">
      <Header email={session.user.email} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Hello there</h2>
          <p className="text-sm text-slate-500 mt-1">
            {age} y/o · BMI {profile.bmi.toFixed(1)} ·{" "}
            {readings.length === 0
              ? "no readings yet"
              : `${readings.length} recent windows`}
          </p>
        </div>

        <StatusCard
          score={latestInf?.immune_score ?? null}
          label={latestInf?.risk_label ?? null}
          lastSeen={latest?.window_start ?? null}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SensorTile
            icon="heart"
            label="Heart rate"
            value={latest?.heart_rate_bpm ?? null}
            unit="bpm"
            baseline={baseline?.baseline_hr}
          />
          <SensorTile
            icon="wave"
            label="HRV"
            value={latest?.hrv_ms ?? null}
            unit="ms"
            baseline={baseline?.baseline_hrv}
          />
          <SensorTile
            icon="thermo"
            label="Skin temp"
            value={latest?.skin_temp_c ?? null}
            unit="°C"
            baseline={baseline?.baseline_temp}
          />
          <SensorTile
            icon="spark"
            label="EDA"
            value={latest?.eda_microsiemens ?? null}
            unit="μS"
            baseline={baseline?.baseline_eda}
          />
        </div>

        <TrendChart data={trend} />

        {!loading && readings.length === 0 && (
          <div className="rounded-2xl bg-accent/5 ring-1 ring-accent/20 p-5 text-sm text-slate-600">
            <p className="font-medium text-ink mb-1">No readings yet</p>
            <p>
              Pair your ESP32 device and start streaming. Each 30-second window will appear
              here automatically.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
