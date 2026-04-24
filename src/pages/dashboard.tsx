import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import AppLayout from "@/components/AppLayout";

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
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/auth/signin");
    });
    fetch("/api/user/settings").then((r) => r.json()).then((d) => {
      if (d.ok) setSettings(d.settings ?? {});
    });
  }, [router]);

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
  const allConnected = notionOk && upworkOk;

  return (
    <AppLayout>
      <h2 className="text-2xl font-semibold text-base-content mb-6">Good Morning!</h2>

      {/* Setup card — shown when not fully connected */}
      {!allConnected && (
        <div className="flex justify-center mt-6">
          <div className="card w-96 bg-base-100 card-lg shadow-sm">
            <div className="card-body">
              <h2 className="card-title">Connect your accounts to get started</h2>
              <p className="text-sm text-base-content/70">
                Set up your integrations before syncing Upwork data to Notion.
              </p>
              <ul className="text-sm text-base-content/70 list-none mt-1 space-y-0.5">
                {!upworkOk && <li>1. Connect Upwork</li>}
                {!notionOk && <li>{!upworkOk ? "2" : "1"}. Connect Notion</li>}
              </ul>
              <div className="justify-end card-actions mt-2">
                <Link href="/settings" className="btn btn-primary btn-sm">
                  Go to integrations
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync card — shown when connected */}
      {allConnected && (
        <div className="card bg-base-100 shadow max-w-xl mb-4">
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
              <div role="alert" className={`alert alert-soft ${syncError ? "alert-error" : "alert-success"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                  {syncError
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  }
                </svg>
                <span>{syncMsg}</span>
              </div>
            )}
            <div className="card-actions mt-1">
              <button onClick={syncNow} disabled={syncing} className="btn btn-soft btn-primary btn-sm">
                {syncing && <span className="loading loading-spinner loading-xs" />}
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-base-content/40">
        Sync runs automatically every 10 minutes via GitHub Actions.
      </p>
    </AppLayout>
  );
}
