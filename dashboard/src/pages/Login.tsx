import { useState } from "react";
import { supabase } from "../lib/supabase";

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const btnCls =
  "w-full rounded-lg bg-accent text-white font-medium px-4 py-2.5 hover:bg-sky-600 disabled:opacity-50";

export function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setInfo(null);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setErr(error.message);
    else if (mode === "signup")
      setInfo("Account created. Check your email if confirmation is required, then sign in.");
    setBusy(false);
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-accent/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 className="w-7 h-7 text-accent">
              <path d="M3 12h4l2-7 4 14 2-7h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold">Welcome to ImmuneSense</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "signin" ? "Sign in to your account" : "Create an account"}
          </p>
        </div>
        <form onSubmit={submit} className="bg-card rounded-2xl ring-1 ring-line p-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 ${inputCls}`}
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1 ${inputCls}`}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>
          {err && <p className="text-sm text-bad">{err}</p>}
          {info && <p className="text-sm text-good">{info}</p>}
          <button type="submit" disabled={busy} className={btnCls}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            className="text-accent font-medium hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
