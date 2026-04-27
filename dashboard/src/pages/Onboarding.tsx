import { useState } from "react";
import { RACE_OPTIONS, supabase, type Profile } from "../lib/supabase";

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export function Onboarding({
  userId,
  onSaved,
}: {
  userId: string;
  onSaved: (p: Profile) => void;
}) {
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"" | "0" | "1">("");
  const [race, setRace] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bmi =
    heightCm && weightKg
      ? (Number(weightKg) / Math.pow(Number(heightCm) / 100, 2)).toFixed(1)
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setErr("Please acknowledge the consent statement to continue.");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = {
      user_id: userId,
      date_of_birth: dob,
      gender: Number(gender) as 0 | 1,
      race_code: race,
      height_cm: Number(heightCm),
      weight_kg: Number(weightKg),
      consent_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("profiles")
      .insert(payload)
      .select()
      .single();
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    onSaved(data as Profile);
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Tell us about you</h1>
          <p className="text-sm text-slate-500 mt-1">
            These details combine with your sensor readings to estimate inflammation risk.
            They're stored once and only visible to you.
          </p>
        </div>
        <form onSubmit={submit} className="bg-card rounded-2xl ring-1 ring-line p-6 space-y-5">
          <Field label="Date of birth">
            <input
              type="date"
              required
              value={dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDob(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Biological sex">
            <div className="flex gap-2">
              {[
                { v: "1", label: "Male" },
                { v: "0", label: "Female" },
              ].map((o) => (
                <button
                  type="button"
                  key={o.v}
                  onClick={() => setGender(o.v as "0" | "1")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                    gender === o.v
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Race / ethnicity">
            <select
              required
              value={race}
              onChange={(e) => setRace(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {RACE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (cm)">
              <input
                type="number"
                required
                min={100}
                max={230}
                step="0.1"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Weight (kg)">
              <input
                type="number"
                required
                min={30}
                max={200}
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {bmi && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              BMI: <span className="font-semibold text-ink">{bmi}</span>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              I understand this is a class research project, not a medical device, and I
              consent to my sensor and demographic data being stored for inflammation-risk
              modelling.
            </span>
          </label>

          {err && <p className="text-sm text-bad">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent text-white font-medium px-4 py-2.5 hover:bg-sky-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
