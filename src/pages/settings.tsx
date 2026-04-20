import { useEffect, useState } from "react";
import { useRouter } from "next/router";
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
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <a href="/dashboard" className="text-sm text-gray-500 hover:underline">← Dashboard</a>
        </div>

        {/* Upwork */}
        <form onSubmit={save} className="bg-white rounded-xl shadow p-6 mb-6 space-y-4">
          <h2 className="font-semibold">Upwork API</h2>

          <div className="text-xs text-gray-500 space-y-1">
            <p>
              1. Register a Web project at{" "}
              <a href="https://www.upwork.com/developer/keys/new" target="_blank" rel="noreferrer" className="underline">
                upwork.com/developer/keys/new
              </a>
            </p>
            <p>2. Set the Callback URL to:</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-gray-100 px-3 py-1.5 rounded break-all">{CALLBACK_URL}</code>
              <button type="button" onClick={copyCallback} className="shrink-0 text-blue-600 hover:underline">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p>3. Paste the Key and Secret below, save, then click Connect.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Key</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...field("upwork_client_id")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...field("upwork_client_secret")}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>

          <div className="pt-1 border-t border-gray-100">
            {upworkConnected
              ? <p className="text-green-600 text-sm mb-2">✓ Upwork connected</p>
              : <p className="text-gray-500 text-sm mb-2">Not connected yet</p>}
            <a
              href="/api/upwork/auth"
              className={`inline-block px-4 py-2 rounded-lg text-sm text-white ${upworkReady ? "bg-green-600 hover:bg-green-700" : "bg-gray-300 pointer-events-none"}`}
            >
              {upworkConnected ? "Reconnect Upwork" : "Connect Upwork"}
            </a>
            {!upworkReady && (
              <p className="text-xs text-gray-400 mt-1">Save your Key and Secret first.</p>
            )}
          </div>
        </form>

        {/* Notion */}
        <form onSubmit={save} className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="font-semibold">Notion</h2>
          <p className="text-xs text-gray-500">
            Get your integration token at{" "}
            <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="underline">
              notion.so/my-integrations
            </a>. Database IDs are the 32-char hex in the DB URL.
          </p>

          {([
            ["notion_token", "Notion Integration Token", "password"],
            ["job_feed_db_id", "Job Feed Database ID", "text"],
            ["filters_db_id", "Filters Database ID", "text"],
            ["diary_db_id", "Work Diary Database ID", "text"],
          ] as [keyof Settings, string, string][]).map(([key, label, type]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={type}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                {...field(key)}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
          </button>
        </form>
      </div>
    </div>
  );
}
