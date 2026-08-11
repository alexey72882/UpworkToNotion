import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AppLayout from "@/components/AppLayout";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export default function McpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    setServerUrl(`${window.location.origin}/api/mcp`);
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth/signin"); return; }
      const d = await fetch("/api/user/mcp-token").then((r) => r.json());
      if (d.ok) setToken(d.token);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
    setTimeout(() => setToast(null), 3300);
  }

  async function generate() {
    setGenerating(true);
    const d = await fetch("/api/user/mcp-token", { method: "POST" }).then((r) => r.json());
    setGenerating(false);
    if (d.ok) setToken(d.token);
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value);
    showToast("Copied to clipboard", "success");
  }

  const mailIcon = (
    <svg className="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="2.5" fill="none" stroke="currentColor">
        <rect width="20" height="16" x="2" y="4" rx="2"></rect>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
      </g>
    </svg>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">MCP Server</h1>
          <p className="text-base-content/60 mt-1">
            Connect your Notion Custom Agent so it can submit Upwork proposals for you.
          </p>
        </div>

        {loading ? (
          <div className="skeleton h-48 w-full" />
        ) : (
          <>
            <div className="card bg-base-100 shadow-sm">
              <div className="card-body gap-4">
                <h2 className="card-title text-lg">Connection</h2>

                <div>
                  <label className="label"><span className="label-text">Server URL</span></label>
                  <div className="join w-full">
                    <div className="flex-1">
                      <label className="input validator join-item w-full font-mono text-sm">
                        {mailIcon}
                        <input type="text" readOnly value={serverUrl} />
                      </label>
                    </div>
                    <button className="btn btn-neutral join-item" onClick={() => copy(serverUrl)}>Copy</button>
                  </div>
                </div>

                <div>
                  <label className="label"><span className="label-text">Auth token (Bearer)</span></label>
                  {token ? (
                    <div className="join w-full">
                      <div className="flex-1">
                        <label className="input validator join-item w-full font-mono text-sm">
                          {mailIcon}
                          <input type="text" readOnly value={token} />
                        </label>
                      </div>
                      <button className="btn btn-neutral join-item" onClick={() => copy(token)}>Copy</button>
                    </div>
                  ) : (
                    <p className="text-base-content/60 text-sm">No token yet — generate one below.</p>
                  )}
                  <div className="mt-3">
                    <button className={`btn btn-primary btn-soft ${generating ? "btn-disabled" : ""}`} onClick={generate}>
                      {generating ? "Generating…" : token ? "Regenerate token" : "Generate token"}
                    </button>
                    {token && (
                      <p className="text-warning text-xs mt-2">
                        Regenerating invalidates the old token — you&apos;ll need to reconnect Notion.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-sm">
              <div className="card-body gap-2">
                <h2 className="card-title text-lg">Connect in Notion</h2>
                <p className="text-sm text-base-content/70">Requires a Notion Business or Enterprise plan.</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Workspace admin: Settings → Connections → enable <b>Custom MCP servers</b>.</li>
                  <li>Open your Custom Agent → Settings → <b>Tools &amp; Access</b> → <b>Custom MCP server</b>.</li>
                  <li>Paste the <b>Server URL</b> above and the <b>Auth token</b> as a Bearer token.</li>
                  <li>Enable the <code>submit_proposal</code> tool.</li>
                </ol>
                <p className="text-xs text-base-content/50 mt-2">
                  <b>submit_proposal</b> spends Upwork Connects and can&apos;t be undone. Fill Bid, Cover Letter, and Screening Answers on the job row first.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast notification (same pattern as the sync job) */}
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
