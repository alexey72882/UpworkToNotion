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
  upwork_name?: string;
  total_jobs_created?: number;
  last_sync_at?: string;
  last_sync_result?: { jobs: SyncResult; contracts: SyncResult };
};

function greeting(name?: string) {
  const hour = new Date().getHours();
  const time = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return name ? `Good ${time}, ${name}!` : `Good ${time}!`;
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

export default function Dashboard() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
    setTimeout(() => setToast(null), 3300);
  }

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/auth/signin");
    });

    const fetchSettings = () =>
      fetch("/api/user/settings").then((r) => r.json()).then((d) => {
        if (d.ok) setSettings(d.settings ?? {});
      });

    fetchSettings();
    const id = setInterval(fetchSettings, 15000);
    return () => clearInterval(id);
  }, [router]);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/sync");
      const d = await r.json();
      if (d.ok) {
        showToast(`Done — ${d.jobs.created} jobs created, ${d.jobs.updated} updated`, "success");
        const s = await fetch("/api/user/settings").then((r) => r.json());
        if (s.ok) setSettings(s.settings);
      } else {
        showToast(`Error: ${d.error}`, "error");
      }
    } catch {
      showToast("Network error", "error");
    }
    setSyncing(false);
  }

  const notionOk = !!(settings?.notion_token && settings.job_feed_db_id);
  const upworkOk = !!settings?.upwork_person_id;
  const allConnected = notionOk && upworkOk;
  const lastResult = settings?.last_sync_result;

  if (settings === null) {
    return (
      <AppLayout>
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="stats bg-base-100 shadow-sm w-full">
          {[1, 2, 3].map((i) => (
            <div key={i} className="stat">
              <div className="stat-figure"><div className="skeleton h-8 w-8 rounded-full" /></div>
              <div className="skeleton h-3 w-24 mb-2" />
              <div className="skeleton h-8 w-16 mb-2" />
              <div className="skeleton h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="skeleton h-8 w-24 mt-4" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h2 className="text-2xl font-semibold text-base-content mb-6">{greeting(settings?.upwork_name)}</h2>

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

      {/* Stats — shown when connected */}
      {allConnected && (
        <div className="flex flex-col gap-4">
          <div className="stats bg-base-100 shadow-sm w-full">

            {/* Update frequency */}
            <div className="stat">
              <div className="stat-figure">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 5.84127V16H23.619M31.2381 16C31.2381 18.0011 30.844 19.9826 30.0782 21.8314C29.3124 23.6801 28.1899 25.36 26.775 26.775C25.36 28.1899 23.6801 29.3124 21.8314 30.0782C19.9826 30.844 18.0011 31.2381 16 31.2381C13.9989 31.2381 12.0174 30.844 10.1686 30.0782C8.31986 29.3124 6.64003 28.1899 5.22504 26.775C3.81005 25.36 2.68762 23.6801 1.92184 21.8314C1.15605 19.9826 0.761905 18.0011 0.761905 16C0.761905 11.9586 2.36734 8.08274 5.22504 5.22504C8.08274 2.36734 11.9586 0.761905 16 0.761905C20.0414 0.761905 23.9173 2.36734 26.775 5.22504C29.6327 8.08274 31.2381 11.9586 31.2381 16Z" stroke="#F000B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="stat-title">Update frequency</div>
              <div className="stat-value">1<span className="text-lg font-normal text-base-content/50 ml-1">min</span></div>
              <div className="stat-desc">
                {settings?.last_sync_at ? `Last sync ${timeAgo(settings.last_sync_at)}` : "Never synced"}
              </div>
            </div>

            {/* Jobs fetched */}
            <div className="stat">
              <div className="stat-figure">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M29.9682 19.6402V26.836C29.9682 28.6883 28.6357 30.2832 26.7987 30.527C23.2651 30.996 19.6605 31.2381 16 31.2381C12.3395 31.2381 8.73486 30.996 5.20134 30.527C3.36431 30.2832 2.03183 28.6883 2.03183 26.836V19.6402M29.9682 19.6402C30.3702 19.2908 30.6919 18.8586 30.9111 18.3731C31.1303 17.8877 31.2418 17.3606 31.238 16.8279V10.4229C31.238 8.59259 29.9377 7.01122 28.1278 6.74032C26.21 6.4532 24.2825 6.23464 22.3492 6.08508M29.9682 19.6402C29.6397 19.9196 29.2571 20.1397 28.8287 20.2836C24.6911 21.6565 20.3594 22.3539 16 22.3492C11.5166 22.3492 7.20429 21.6229 3.1713 20.2836C2.75354 20.1446 2.3666 19.9262 2.03183 19.6402M2.03183 19.6402C1.62979 19.2908 1.30813 18.8586 1.08894 18.3731C0.869743 17.8877 0.75821 17.3606 0.761998 16.8279V10.4229C0.761998 8.59259 2.06231 7.01122 3.87224 6.74032C5.79003 6.45319 7.71745 6.23464 9.65083 6.08508M22.3492 6.08508V4.57143C22.3492 3.56108 21.9478 2.59211 21.2334 1.87769C20.519 1.16326 19.55 0.761905 18.5397 0.761905H13.4603C12.45 0.761905 11.481 1.16326 10.7666 1.87769C10.0522 2.59211 9.65083 3.56108 9.65083 4.57143V6.08508M22.3492 6.08508C18.1227 5.75844 13.8773 5.75844 9.65083 6.08508M16 17.2698H16.0135V17.2834H16V17.2698Z" stroke="#F000B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="stat-title">New jobs</div>
              <div className="stat-value">{settings?.total_jobs_created ?? "—"}</div>
              <div className="stat-desc">
                {lastResult ? `+${lastResult.jobs.created} during last sync` : "No data yet"}
              </div>
            </div>

            {/* Diary updates */}
            <div className="stat">
              <div className="stat-figure">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.11111 0.761905V4.57143M24.8889 0.761905V4.57143M0.761905 27.4286V8.38095C0.761905 7.3706 1.16326 6.40164 1.87769 5.68721C2.59211 4.97279 3.56108 4.57143 4.57143 4.57143H27.4286C28.4389 4.57143 29.4079 4.97279 30.1223 5.68721C30.8367 6.40164 31.2381 7.3706 31.2381 8.38095V27.4286M0.761905 27.4286C0.761905 28.4389 1.16326 29.4079 1.87769 30.1223C2.59211 30.8367 3.56108 31.2381 4.57143 31.2381H27.4286C28.4389 31.2381 29.4079 30.8867 30.1223 30.1223C30.8367 29.4079 31.2381 28.4389 31.2381 27.4286M0.761905 27.4286V14.7302C0.761905 13.7198 1.16326 12.7508 1.87769 12.0364C2.59211 11.322 3.56108 10.9206 4.57143 10.9206H27.4286C28.4389 10.9206 29.4079 11.322 30.1223 12.0364C30.8367 12.7508 31.2381 13.7198 31.2381 14.7302V27.4286M16 17.2698H16.0135V17.2834H16V17.2698ZM16 21.0794H16.0135V21.0929H16V21.0794ZM16 24.8889H16.0135V24.9024H16V24.8889ZM12.1905 21.0794H12.204V21.0929H12.1905V21.0794ZM12.1905 24.8889H12.204V24.9024H12.1905V24.8889ZM8.38095 21.0794H8.3945V21.0929H8.38095V21.0794ZM8.38095 24.8889H8.3945V24.9024H8.38095V24.8889ZM19.8095 17.2698H19.8231V17.2834H19.8095V17.2698ZM19.8095 21.0794H19.8231V21.0929H19.8095V21.0794ZM19.8095 24.8889H19.8231V24.9024H19.8095V24.8889ZM23.619 17.2698H23.6326V17.2834H23.619V17.2698ZM23.619 21.0794H23.6326V21.0929H23.619V21.0794Z" stroke="#F000B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="stat-title">Diary updates</div>
              <div className="stat-value">{lastResult?.contracts.fetched ?? "—"}</div>
              <div className="stat-desc">
                {lastResult ? `+${lastResult.contracts.created} new during last sync` : "No data yet"}
              </div>
            </div>
          </div>

          {/* Sync button */}
          <div className="flex items-center gap-4">
            <button onClick={syncNow} disabled={syncing} className="btn btn-soft btn-primary btn-sm">
              {syncing && <span className="loading loading-spinner loading-xs" />}
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>
      )}
      {/* Toast notification */}
      <div className={`toast toast-top toast-center transition-opacity duration-300 ${toastVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {toast?.type === "success" ? (
          <div role="alert" className="alert alert-outline alert-success bg-[color-mix(in_oklch,var(--color-success)_10%,var(--color-base-100))]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{toast.message}</span>
          </div>
        ) : (
          <div role="alert" className="alert alert-outline alert-error bg-[color-mix(in_oklch,var(--color-error)_10%,var(--color-base-100))]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{toast?.message}</span>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
