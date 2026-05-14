import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !anon) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}
export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
export type Profile = {
  user_id: string;
  date_of_birth: string;
  gender: 0 | 1;
  race_code: string;
  height_cm: number;
  weight_kg: number;
  bmi: number;
};
export type SensorWindow = {
  window_id: number;
  user_id: string;
  window_start: string;
  window_end: string;
  heart_rate_bpm: number | null;
  hrv_ms: number | null;
  skin_temp_c: number | null;
  eda_microsiemens: number | null;
  quality_flag: number;
};
export type Inference = {
  window_id: number;
  user_id: string;
  immune_score: number;
  risk_label: 0 | 1;
  inferred_at: string;
};
export type Baseline = {
  baseline_hr: number | null;
  baseline_hrv: number | null;
  baseline_temp: number | null;
  baseline_eda: number | null;
};
export const RACE_OPTIONS: { code: string; label: string }[] = [
  { code: "2106-3", label: "White" },
  { code: "2054-5", label: "Black or African American" },
  { code: "2028-9", label: "Asian" },
  { code: "2186-5", label: "Hispanic or Latino" },
  { code: "2076-8", label: "Native Hawaiian or Pacific Islander" },
  { code: "2131-1", label: "Other" },
];
