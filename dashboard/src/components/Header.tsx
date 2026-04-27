import { supabase } from "../lib/supabase";

export function Header({ email }: { email: string | undefined }) {
  return (
    <header className="bg-white border-b border-line">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 className="w-5 h-5 text-accent">
              <path d="M3 12h4l2-7 4 14 2-7h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">ImmuneSense</h1>
            <p className="text-xs text-slate-500 leading-tight">Inflammation Monitor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 hidden sm:inline">{email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm font-medium text-slate-700 hover:text-ink px-3 py-1.5 rounded-md hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
