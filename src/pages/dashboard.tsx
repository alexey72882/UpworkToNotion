import { useEffect, useState } from "react";
import { useRouter } from "next/router";
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
    try {
      const r = await fetch("/api/sync");
      const d = await r.json();
      if (d.ok) {
        setSyncMsg(`Done — ${d.jobs.created} jobs created, ${d.jobs.updated} updated`);
        // Refresh settings to get updated last_sync_at
        const s = await fetch("/api/user/settings").then((r) => r.json());
        if (s.ok) setSettings(s.settings);
      } else {
        setSyncMsg(`Error: ${d.error}`);
      }
    } catch {
      setSyncMsg("Network error");
    }
    setSyncing(false);
  }

  const notionOk = !!(settings?.notion_token && settings.job_feed_db_id);
  const upworkOk = !!settings?.upwork_person_id;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex gap-3 items-center">
            <span className="text-sm text-gray-500">{userEmail}</span>
            <button onClick={signOut} className="text-sm text-gray-500 hover:underline">Sign out</button>
          </div>
        </div>

        {/* Connection status */}
        <div className="bg-white rounded-xl shadow p-6 mb-4">
          <h2 className="font-semibold mb-4">Connections</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Upwork</span>
              <span className={`text-sm font-medium ${upworkOk ? "text-green-600" : "text-red-500"}`}>
                {upworkOk ? "✓ Connected" : "✗ Not connected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Notion</span>
              <span className={`text-sm font-medium ${notionOk ? "text-green-600" : "text-red-500"}`}>
                {notionOk ? "✓ Connected" : "✗ Not configured"}
              </span>
            </div>
          </div>
          <a href="/settings" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Edit settings →
          </a>
        </div>

        {/* Sync */}
        <div className="bg-white rounded-xl shadow p-6 mb-4">
          <h2 className="font-semibold mb-3">Sync</h2>
          {settings?.last_sync_at && (
            <p className="text-sm text-gray-500 mb-1">
              Last sync: {new Date(settings.last_sync_at).toLocaleString()}
            </p>
          )}
          {settings?.last_sync_result && (
            <p className="text-sm text-gray-500 mb-3">
              Jobs: {settings.last_sync_result.jobs.fetched} fetched &middot; Contracts: {settings.last_sync_result.contracts.fetched} fetched
            </p>
          )}
          {syncMsg && <p className="text-sm text-blue-600 mb-3">{syncMsg}</p>}
          <button
            onClick={syncNow}
            disabled={syncing || !notionOk || !upworkOk}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {(!notionOk || !upworkOk) && (
            <p className="text-xs text-gray-400 mt-2">Connect Upwork and configure Notion in settings first.</p>
          )}
        </div>

        {/* Cron note */}
        <p className="text-xs text-gray-400 text-center">
          Sync runs automatically every 30 minutes via GitHub Actions.
        </p>
      </div>
    </div>
  );
}
