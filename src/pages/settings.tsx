import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const CALLBACK_URL = "https://upwork-to-notion.vercel.app/api/upwork/callback";

type Settings = {
  notion_token?: string;
  job_feed_db_id?: string;
  filters_db_id?: string;
  diary_db_id?: string;
  upwork_person_id?: string;
  upwork_client_id?: string;
  upwork_client_secret?: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [upworkConnected, setUpworkConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setForm(d.settings ?? {});
          setUpworkConnected(!!d.settings?.upwork_person_id);
        }
      });

    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/auth/signin");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = (key: keyof Settings) => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function copyCallback() {
    navigator.clipboard.writeText(CALLBACK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const upworkReady = !!(form.upwork_client_id && form.upwork_client_secret);

  return (
    <div className="min-h-screen bg-base-200 py-10 px-4">
      <div className="max-w-lg mx-auto">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</Link>
        </div>

        {/* Upwork */}
        <form onSubmit={save} className="card bg-base-100 shadow mb-6">
          <div className="card-body space-y-4">
            <h2 className="card-title text-base">Upwork API</h2>

            <div className="text-xs text-base-content/50 space-y-1">
              <p>
                1. Register a Web project at{" "}
                <a href="https://www.upwork.com/developer/keys/new" target="_blank" rel="noreferrer" className="link">
                  upwork.com/developer/keys/new
                </a>
              </p>
              <p>2. Set the Callback URL to:</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-base-200 px-3 py-1.5 rounded text-xs break-all">{CALLBACK_URL}</code>
                <button type="button" onClick={copyCallback} className="btn btn-ghost btn-xs shrink-0">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p>3. Paste the Key and Secret below, save, then click Connect.</p>
            </div>

            <label className="form-control w-full">
              <div className="label"><span className="label-text">Client Key</span></div>
              <input type="text" className="input input-bordered w-full" {...field("upwork_client_id")} />
            </label>

            <label className="form-control w-full">
              <div className="label"><span className="label-text">Client Secret</span></div>
              <input type="password" className="input input-bordered w-full" {...field("upwork_client_secret")} />
            </label>

            <button type="submit" disabled={saving} className="btn btn-soft btn-primary w-full">
              {saving && <span className="loading loading-spinner loading-xs" />}
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>

            <div className="divider my-0" />

            <div>
              {upworkConnected
                ? <div className="badge badge-success mb-2">✓ Upwork connected</div>
                : <p className="text-sm text-base-content/50 mb-2">Not connected yet</p>}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/upwork/auth"
                className={`btn btn-sm ${upworkReady ? "btn-success" : "btn-disabled"}`}
              >
                {upworkConnected ? "Reconnect Upwork" : "Connect Upwork"}
              </a>
              {!upworkReady && (
                <p className="text-xs text-base-content/40 mt-1">Save your Key and Secret first.</p>
              )}
            </div>
          </div>
        </form>

        {/* Notion */}
        <form onSubmit={save} className="card bg-base-100 shadow">
          <div className="card-body space-y-4">
            <h2 className="card-title text-base">Notion</h2>
            <p className="text-xs text-base-content/50">
              Get your integration token at{" "}
              <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="link">
                notion.so/my-integrations
              </a>. Database IDs are the 32-char hex in the DB URL.
            </p>

            {([
              ["notion_token", "Notion Integration Token", "password"],
              ["job_feed_db_id", "Job Feed Database ID", "text"],
              ["filters_db_id", "Filters Database ID", "text"],
              ["diary_db_id", "Work Diary Database ID", "text"],
            ] as [keyof Settings, string, string][]).map(([key, label, type]) => (
              <label key={key} className="form-control w-full">
                <div className="label"><span className="label-text">{label}</span></div>
                <input type={type} className="input input-bordered w-full" {...field(key)} />
              </label>
            ))}

            <button type="submit" disabled={saving} className="btn btn-soft btn-primary w-full">
              {saving && <span className="loading loading-spinner loading-xs" />}
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
