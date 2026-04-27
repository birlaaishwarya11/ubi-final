import { useEffect, useState } from "react";
import { supabase, type Profile } from "../lib/supabase";

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setProfile((data as Profile) ?? null);
        setLoading(false);
      });
  }, [userId]);

  return { profile, loading, setProfile };
}
