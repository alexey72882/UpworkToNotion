import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AppLayout from "@/components/AppLayout";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export default function McpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState("");
  const [serverUrl, setServerUrl] = useState("");

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

  async function generate() {
    setGenerating(true);
    const d = await fetch("/api/user/mcp-token", { method: "POST" }).then((r) => r.json());
    setGenerating(false);
    if (d.ok) setToken(d.token);
  }

  function copy(label: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">MCP Server</h1>
          <p className="text-base-content/60 mt-1">
            Connect your Notion Custom Agent so it can prepare and submit Upwork proposals for you.
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
                    <input className="input input-bordered join-item w-full font-mono text-sm" readOnly value={serverUrl} />
                    <button className="btn join-item" onClick={() => copy("url", serverUrl)}>
                      {copied === "url" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label"><span className="label-text">Auth token (Bearer)</span></label>
                  {token ? (
                    <div className="join w-full">
                      <input className="input input-bordered join-item w-full font-mono text-sm" readOnly value={token} />
                      <button className="btn join-item" onClick={() => copy("token", token)}>
                        {copied === "token" ? "Copied" : "Copy"}
                      </button>
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
                  <li>Enable the <code>prepare_application</code> and <code>submit_proposal</code> tools.</li>
                </ol>
                <p className="text-xs text-base-content/50 mt-2">
                  <b>submit_proposal</b> spends Upwork Connects and can&apos;t be undone. Fill Bid, Cover Letter, and Screening Answers on the job row first.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
