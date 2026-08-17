import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import AppLayout from "@/components/AppLayout";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Copy → check with daisyUI's rotate swap; driven by React state, so it uses
// swap-active rather than the hidden checkbox.
function CopySwapIcon({ copied }: { copied: boolean }) {
  return (
    <span className={`swap swap-rotate ${copied ? "swap-active" : ""}`}>
      <CheckIcon className="swap-on" />
      <CopyIcon className="swap-off" />
    </span>
  );
}

// Read-only value with an overlaid icon copy button — same pattern as Settings step 1
function CopyField({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <div className="text-sm font-bold mb-2">{label}</div>
      <div className="relative">
        <code className="block bg-base-200 pl-3 pr-12 py-2.5 rounded-lg font-mono text-sm truncate">{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={onCopy}
          className="btn btn-ghost btn-sm btn-square absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          <CopySwapIcon copied={copied} />
        </button>
      </div>
    </div>
  );
}

export default function McpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimers = useRef<number[]>([]);
  const confirmModalRef = useRef<HTMLDialogElement>(null);

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
    toastTimers.current.forEach(clearTimeout);
    setToast({ message, type });
    setToastVisible(true);
    toastTimers.current = [
      window.setTimeout(() => setToastVisible(false), 3000),
      window.setTimeout(() => setToast(null), 3300),
    ];
  }

  async function generate() {
    setGenerating(true);
    const d = await fetch("/api/user/mcp-token", { method: "POST" }).then((r) => r.json());
    setGenerating(false);
    if (d.ok) setToken(d.token);
  }

  function copy(value: string, id: string) {
    navigator.clipboard.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
    showToast("Copied to clipboard", "success");
  }

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

                <CopyField label="Server URL" value={serverUrl} copied={copied === "url"} onCopy={() => copy(serverUrl, "url")} />

                <div>
                  {token ? (
                    <CopyField label="Auth token (Bearer)" value={token} copied={copied === "token"} onCopy={() => copy(token, "token")} />
                  ) : (
                    <>
                      <div className="text-sm font-bold mb-2">Auth token (Bearer)</div>
                      <p className="text-base-content/60 text-sm">No token yet — generate one below.</p>
                    </>
                  )}
                  <div className="mt-4 flex justify-center">
                    <button
                      className={`btn btn-primary btn-soft btn-md px-12 ${generating ? "btn-disabled" : ""}`}
                      onClick={() => (token ? confirmModalRef.current?.showModal() : generate())}
                    >
                      {generating ? "Generating…" : token ? "Regenerate token" : "Generate token"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Regenerating invalidates the live token, so confirm first */}
            <dialog ref={confirmModalRef} className="modal modal-bottom sm:modal-middle">
              <div className="modal-box">
                <h3 className="text-lg font-bold">Regenerate token?</h3>
                <p className="py-4">
                  This invalidates the old token — you&apos;ll need to reconnect Notion with the new one.
                </p>
                <div className="modal-action">
                  <form method="dialog" className="flex gap-3">
                    <button className="btn btn-ghost">Cancel</button>
                    <button className="btn btn-warning" onClick={generate}>Regenerate</button>
                  </form>
                </div>
              </div>
              <form method="dialog" className="modal-backdrop">
                <button>close</button>
              </form>
            </dialog>

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
      <div className={`toast toast-top toast-center ${toastVisible ? "" : "pointer-events-none"}`}>
        {toast && (toast.type === "success" ? (
          <div role="alert" className={`alert alert-outline alert-success bg-[color-mix(in_oklch,var(--color-success)_10%,var(--color-base-100))] toast-drop transition-all duration-300 ${toastVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{toast.message}</span>
          </div>
        ) : (
          <div role="alert" className={`alert alert-outline alert-error bg-[color-mix(in_oklch,var(--color-error)_10%,var(--color-base-100))] toast-drop transition-all duration-300 ${toastVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
