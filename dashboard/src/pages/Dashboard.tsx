import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Header } from "../components/Header";
import { SensingControl } from "../components/SensingControl";
import { SensorTile } from "../components/SensorTile";
import { StatusCard } from "../components/StatusCard";
import { TrendChart } from "../components/TrendChart";
import { useReadings } from "../hooks/useReadings";
import type { Profile } from "../lib/supabase";
import { Live } from "./Live";

type Tab = "overview" | "live";

export function Dashboard({ session, profile }: { session: Session; profile: Profile }) {
  const userId = session.user.id;
  const [tab, setTab] = useState<Tab>("overview");
  const { readings, baseline } = useReadings(userId);

  const latest = readings[0];
  const latestInf = latest?.inference;

  const trend = [...readings]
    .reverse()
    .map((r) => ({
      t: new Date(r.window_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      score: r.inference?.immune_score ?? null,
    }));

  const age = new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear();

  return (
    <div className="min-h-screen">
      <Header email={session.user.email} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">Hello there</h2>
            <p className="text-sm text-slate-500 mt-1">
              {age} y/o · BMI {profile.bmi.toFixed(1)} ·{" "}
              {readings.length === 0 ? "no readings yet" : `${readings.length} recent windows`}
            </p>
          </div>
          <Tabs tab={tab} setTab={setTab} />
        </div>

        <SensingControl userId={userId} />

        {tab === "overview" ? (
          <>
            <StatusCard
              score={latestInf?.immune_score ?? null}
              label={latestInf?.risk_label ?? null}
              lastSeen={latest?.window_start ?? null}
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SensorTile icon="heart"  label="Heart rate" value={latest?.heart_rate_bpm ?? null}    unit="bpm" baseline={baseline?.baseline_hr} />
              <SensorTile icon="wave"   label="HRV"        value={latest?.hrv_ms ?? null}            unit="ms"  baseline={baseline?.baseline_hrv} />
              <SensorTile icon="thermo" label="Skin temp"  value={latest?.skin_temp_c ?? null}       unit="°C"  baseline={baseline?.baseline_temp} />
              <SensorTile icon="spark"  label="EDA"        value={latest?.eda_microsiemens ?? null}  unit="μS"  baseline={baseline?.baseline_eda} />
            </div>
            <TrendChart data={trend} />
          </>
        ) : (
          <Live userId={userId} />
        )}
      </main>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const opts: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "live", label: "Live" },
  ];
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-1">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setTab(o.id)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
            tab === o.id ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
