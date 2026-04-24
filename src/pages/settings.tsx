import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import AppLayout from "@/components/AppLayout";

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

type Tab = "upwork" | "notion";

const UPWORK_INSTRUCTIONS_URL = "https://www.upwork.com/developer/keys/new";
const NOTION_INSTRUCTIONS_URL = "https://www.notion.so/my-integrations";

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upwork");
  const [form, setForm] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [upworkConnected, setUpworkConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setForm(d.settings ?? {});
          setUpworkConnected(!!d.settings?.upwork_person_id);
          setNotionConnected(!!(d.settings?.notion_token && d.settings?.job_feed_db_id));
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
  const isConnected = tab === "upwork" ? upworkConnected : notionConnected;

  return (
    <AppLayout>
      <h2 className="text-2xl font-semibold text-base-content mb-6">Integrations</h2>

      <div className="bg-white rounded-2xl shadow w-full max-w-lg">
        <form onSubmit={save} className="p-0">

          {/* Tabs + badge row */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-0">
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-base-200">
              {(["upwork", "notion"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className="px-4 py-1.5 rounded-md text-sm font-normal transition-colors capitalize"
                  style={
                    tab === t
                      ? { background: "#4338CA", color: "#C7D2FE" }
                      : { color: "#374151", opacity: 0.6 }
                  }
                >
                  {t === "upwork" ? "Upwork" : "Notion"}
                </button>
              ))}
            </div>

            {isConnected && (
              <span className="text-xs px-3 py-0.5 rounded-full border text-success border-success">
                Connected
              </span>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Instructions alert */}
            <div className="flex flex-row items-start gap-4 p-4 rounded-2xl bg-base-200">
              <div className="shrink-0 w-6 h-6 text-base-content/50 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-base-content leading-6">Instructions</p>
                {tab === "upwork" ? (
                  <p className="text-xs text-base-content/80 leading-4">
                    To connect Upwork, you&apos;ll need an API Client key and Secret. Apply via the Upwork Developer Portal — approval can take up to 24 hours.
                  </p>
                ) : (
                  <p className="text-xs text-base-content/80 leading-4">
                    Create an integration at notion.so/my-integrations, then share each database with it. Paste the integration token and database IDs below.
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <a
                  href={tab === "upwork" ? UPWORK_INSTRUCTIONS_URL : NOTION_INSTRUCTIONS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-soft btn-neutral btn-xs"
                >
                  Go to instructions
                </a>
              </div>
            </div>

            {/* Upwork fields */}
            {tab === "upwork" && (
              <>
                <label className="form-control w-72">
                  <div className="label py-2 px-1"><span className="label-text text-sm text-base-content">Client key</span></div>
                  <input
                    type="text"
                    placeholder="e.g. abc123xyz_client_key"
                    className="input input-bordered w-full"
                    {...field("upwork_client_id")}
                  />
                </label>

                <label className="form-control w-72">
                  <div className="label py-2 px-1"><span className="label-text text-sm text-base-content">Client secret</span></div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="input input-bordered w-full"
                    {...field("upwork_client_secret")}
                  />
                </label>

                {/* Callback URL helper */}
                <div className="text-xs text-base-content/40 space-y-1">
                  <p>Set this as your OAuth Callback URL:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-xs break-all">{CALLBACK_URL}</code>
                    <button type="button" onClick={copyCallback} className="btn btn-ghost btn-xs shrink-0">
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Connect button */}
                <div className="pt-1">
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a
                    href="/api/upwork/auth"
                    className={`btn btn-sm btn-outline ${upworkReady ? "btn-success" : "btn-disabled"}`}
                  >
                    {upworkConnected ? "Reconnect Upwork" : "Connect Upwork"}
                  </a>
                  {!upworkReady && (
                    <p className="text-xs text-base-content/40 mt-1">Save your Key and Secret first.</p>
                  )}
                </div>
              </>
            )}

            {/* Notion fields */}
            {tab === "notion" && (
              <>
                {([
                  ["notion_token", "Integration token", "password", "secret_abc123..."],
                  ["job_feed_db_id", "Job Feed Database ID", "text", "32-char hex from DB URL"],
                  ["filters_db_id", "Filters Database ID", "text", "32-char hex from DB URL"],
                  ["diary_db_id", "Work Diary Database ID", "text", "32-char hex from DB URL"],
                ] as [keyof Settings, string, string, string][]).map(([key, label, type, placeholder]) => (
                  <label key={key} className="form-control w-72">
                    <div className="label py-2 px-1"><span className="label-text text-sm text-base-content">{label}</span></div>
                    <input
                      type={type}
                      placeholder={placeholder}
                      className="input input-bordered w-full"
                      {...field(key)}
                    />
                  </label>
                ))}
              </>
            )}

            {/* Save button */}
            <button
              type="submit"
              disabled={saving}
              className="btn w-full"
              style={saved ? {} : { background: "#F3F4F6", borderColor: "#F3F4F6", color: "#D1D5DB" }}
            >
              {saving && <span className="loading loading-spinner loading-xs" />}
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
