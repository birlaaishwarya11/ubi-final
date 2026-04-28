import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAuth } from "./hooks/useAuth";
import { useProfile } from "./hooks/useProfile";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";

export default function App() {
  return (
    <ErrorBoundary>
      <Inner />
    </ErrorBoundary>
  );
}

function Inner() {
  const { session, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, setProfile } = useProfile(session?.user.id);

  if (authLoading) return <Splash />;
  if (!session) return <Login />;
  if (profileLoading) return <Splash />;
  if (!profile) return <Onboarding userId={session.user.id} onSaved={setProfile} />;
  return <Dashboard session={session} profile={profile} />;
}

function Splash() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="animate-pulse text-slate-400 text-sm">Loading…</div>
    </div>
  );
}
