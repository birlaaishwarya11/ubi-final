import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INGEST_DEVICE_SECRET = process.env.INGEST_DEVICE_SECRET!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = {
  device_id: string;
  window_seconds?: number;
  heart_rate_bpm?: number | null;
  hrv_ms?: number | null;
  skin_temp_c?: number | null;
  eda_microsiemens?: number | null;
  quality_flag?: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${INGEST_DEVICE_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = req.body as Body;
  if (!body || typeof body.device_id !== "string") {
    return res.status(400).json({ error: "device_id required" });
  }

  const { data: session, error: sessErr } = await supabase
    .from("active_session")
    .select("user_id")
    .eq("device_id", body.device_id)
    .maybeSingle();

  if (sessErr) return res.status(500).json({ error: "session_lookup_failed", detail: sessErr.message });
  if (!session) return res.status(409).json({ error: "no_active_user", device_id: body.device_id });

  const windowSeconds = body.window_seconds ?? 30;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowSeconds * 1000);

  const { data: inserted, error: insErr } = await supabase
    .from("sensor_windows")
    .insert({
      user_id: session.user_id,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      window_seconds: windowSeconds,
      heart_rate_bpm: body.heart_rate_bpm ?? null,
      hrv_ms: body.hrv_ms ?? null,
      skin_temp_c: body.skin_temp_c ?? null,
      eda_microsiemens: body.eda_microsiemens ?? null,
      quality_flag: body.quality_flag ?? 0,
    })
    .select("window_id")
    .single();

  if (insErr) return res.status(500).json({ error: "insert_failed", detail: insErr.message });

  await supabase
    .from("active_session")
    .update({ last_seen_at: windowEnd.toISOString() })
    .eq("device_id", body.device_id);

  return res.status(201).json({ window_id: inserted.window_id, user_id: session.user_id });
}
