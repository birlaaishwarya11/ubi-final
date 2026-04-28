import { useState } from "react";
import { useActiveSession } from "../hooks/useActiveSession";

export function SensingControl({ userId }: { userId: string }) {
  const { session, loading, busy, mine, start, stop, deviceId } = useActiveSession(userId);
  const [err, setErr] = useState<string | null>(null);

  const heldByOther = session && !mine;

  async function handleStart() {
    try {
      setErr(null);
      await start();
    } catch (e: unknown) {
      setErr((e as Error).message);
    }
  }

  async function handleStop() {
    try {
      setErr(null);
      await stop();
    } catch (e: unknown) {
      setErr((e as Error).message);
    }
  }

  const dot =
    mine ? "bg-good" :
    heldByOther ? "bg-warn" :
    "bg-slate-300";

  return (
    <div className="bg-card rounded-2xl ring-1 ring-line p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`relative inline-flex h-3 w-3 rounded-full ${dot}`}>
          {mine && (
            <span className="absolute inset-0 rounded-full bg-good opacity-60 animate-ping" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">
            {loading
              ? "Checking device…"
              : mine
              ? "Device streaming to your account"
              : heldByOther
              ? "Device claimed by another user"
              : "Device idle"}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {deviceId}
            {session?.last_seen_at && mine && (
              <>
                {" · last reading "}
                {new Date(session.last_seen_at).toLocaleTimeString()}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {err && <span className="text-xs text-bad max-w-[200px] truncate">{err}</span>}
        {mine ? (
          <button
            onClick={handleStop}
            disabled={busy}
            className="rounded-lg bg-slate-100 hover:bg-slate-200 text-ink text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            Stop sensing
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={busy}
            className="rounded-lg bg-accent hover:bg-sky-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {heldByOther ? "Take over" : "Start sensing"}
          </button>
        )}
      </div>
    </div>
  );
}
