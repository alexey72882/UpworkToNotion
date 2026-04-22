import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

type SyncResult = { fetched: number; created: number; updated: number; skipped: number };
type Settings = {
  notion_token?: string;
  job_feed_db_id?: string;
  filters_db_id?: string;
  diary_db_id?: string;
  upwork_person_id?: string;
  last_sync_at?: string;
  last_sync_result?: { jobs: SyncResult; contracts: SyncResult };
};

export default function Dashboard() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/auth/signin"); return; }
      setUserEmail(user.email ?? "");
    });
    fetch("/api/user/settings").then((r) => r.json()).then((d) => {
      if (d.ok) setSettings(d.settings ?? {});
    });
  }, [router]);

  async function signOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.replace("/auth/signin");
  }

  async function syncNow() {
    setSyncing(true);
    setSyncMsg("");
    setSyncError(false);
    try {
      const r = await fetch("/api/sync");
      const d = await r.json();
      if (d.ok) {
        setSyncMsg(`Done — ${d.jobs.created} jobs created, ${d.jobs.updated} updated`);
        const s = await fetch("/api/user/settings").then((r) => r.json());
        if (s.ok) setSettings(s.settings);
      } else {
        setSyncMsg(`Error: ${d.error}`);
        setSyncError(true);
      }
    } catch {
      setSyncMsg("Network error");
      setSyncError(true);
    }
    setSyncing(false);
  }

  const notionOk = !!(settings?.notion_token && settings.job_feed_db_id);
  const upworkOk = !!settings?.upwork_person_id;

  return (
    <div className="min-h-screen bg-base-200 py-10 px-4">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex gap-3 items-center">
            <span className="text-sm text-base-content/50">{userEmail}</span>
            <button onClick={signOut} className="btn btn-ghost btn-sm">Sign out</button>
          </div>
        </div>

        {/* Connections */}
        <div className="card bg-base-100 shadow mb-4">
          <div className="card-body">
            <h2 className="card-title text-base">Connections</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Upwork</span>
                <span className={`badge ${upworkOk ? "badge-success" : "badge-error"} badge-sm`}>
                  {upworkOk ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Notion</span>
                <span className={`badge ${notionOk ? "badge-success" : "badge-error"} badge-sm`}>
                  {notionOk ? "Connected" : "Not configured"}
                </span>
              </div>
            </div>
            <div className="card-actions mt-2">
              <Link href="/settings" className="btn btn-ghost btn-xs">Edit settings →</Link>
            </div>
          </div>
        </div>

        {/* Sync */}
        <div className="card bg-base-100 shadow mb-4">
          <div className="card-body">
            <h2 className="card-title text-base">Sync</h2>
            {settings?.last_sync_at && (
              <p className="text-sm text-base-content/50">
                Last sync: {new Date(settings.last_sync_at).toLocaleString()}
              </p>
            )}
            {settings?.last_sync_result && (
              <p className="text-sm text-base-content/50">
                Jobs: {settings.last_sync_result.jobs.fetched} fetched &middot; Contracts: {settings.last_sync_result.contracts.fetched} fetched
              </p>
            )}
            {syncMsg && (
              <div className={`alert ${syncError ? "alert-error" : "alert-success"} py-2 text-sm`}>
                {syncMsg}
              </div>
            )}
            <div className="card-actions mt-1">
              <button
                onClick={syncNow}
                disabled={syncing || !notionOk || !upworkOk}
                className="btn btn-soft btn-primary btn-sm"
              >
                {syncing && <span className="loading loading-spinner loading-xs" />}
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            {(!notionOk || !upworkOk) && (
              <p className="text-xs text-base-content/40">Connect Upwork and configure Notion in settings first.</p>
            )}
          </div>
        </div>

        <p className="text-xs text-base-content/30 text-center">
          Sync runs automatically every 10 minutes via GitHub Actions.
        </p>
      </div>
    </div>
  );
}
