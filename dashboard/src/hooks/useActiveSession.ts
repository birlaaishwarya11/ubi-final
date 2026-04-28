import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const DEVICE_ID = "immune-feather-1";

export type ActiveSession = {
  device_id: string;
  user_id: string;
  started_at: string;
  last_seen_at: string | null;
};

export function useActiveSession(myUserId: string) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data } = await supabase
      .from("active_session")
      .select("*")
      .eq("device_id", DEVICE_ID)
      .maybeSingle();
    setSession((data as ActiveSession) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`active_session:${DEVICE_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "active_session", filter: `device_id=eq.${DEVICE_ID}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function start() {
    setBusy(true);
    const { error } = await supabase
      .from("active_session")
      .upsert(
        { device_id: DEVICE_ID, user_id: myUserId, started_at: new Date().toISOString() },
        { onConflict: "device_id" },
      );
    setBusy(false);
    if (error) throw error;
    await refresh();
  }

  async function stop() {
    setBusy(true);
    const { error } = await supabase
      .from("active_session")
      .delete()
      .eq("device_id", DEVICE_ID)
      .eq("user_id", myUserId);
    setBusy(false);
    if (error) throw error;
    await refresh();
  }

  const mine = session?.user_id === myUserId;
  return { session, loading, busy, mine, start, stop, deviceId: DEVICE_ID };
}
