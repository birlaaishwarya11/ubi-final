import { useEffect, useState } from "react";
import { supabase, type Baseline, type Inference, type SensorWindow } from "../lib/supabase";

export type Reading = SensorWindow & { inference?: Inference };

export function useReadings(userId: string | undefined) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [w, i, b] = await Promise.all([
        supabase
          .from("sensor_windows")
          .select("*")
          .eq("user_id", userId)
          .order("window_start", { ascending: false })
          .limit(96),
        supabase
          .from("inferences")
          .select("*")
          .eq("user_id", userId)
          .order("inferred_at", { ascending: false })
          .limit(96),
        supabase.from("baselines").select("*").eq("user_id", userId).maybeSingle(),
      ]);

      if (cancelled) return;

      const inferenceById = new Map<number, Inference>();
      ((i.data as Inference[]) ?? []).forEach((r) => inferenceById.set(r.window_id, r));
      const merged: Reading[] = ((w.data as SensorWindow[]) ?? []).map((row) => ({
        ...row,
        inference: inferenceById.get(row.window_id),
      }));
      setReadings(merged);
      setBaseline((b.data as Baseline) ?? null);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`windows:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_windows", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inferences", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { readings, baseline, loading };
}
