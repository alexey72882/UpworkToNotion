import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import Logo from "@/components/Logo";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token_hash = params.get("token_hash");
    const type = params.get("type");

    if (!token_hash || type !== "recovery") {
      setError("Invalid or missing reset link. Please request a new one.");
      return;
    }

    getSupabaseBrowser()
      .auth.verifyOtp({ token_hash, type: "recovery" })
      .then(({ error }) => {
        if (error) setError(error.message);
        else setReady(true);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await getSupabaseBrowser().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.replace("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="w-full max-w-lg bg-base-100 rounded-2xl shadow p-6 flex flex-col gap-6">

        <Logo size={60} />

        <h1 className="text-4xl font-extrabold text-center text-base-content leading-tight">
          New password
        </h1>

        {!ready && !error && (
          <div className="flex justify-center">
            <span className="loading loading-spinner loading-md" />
          </div>
        )}

        {error && (
          <div className="flex flex-col gap-3">
            <div role="alert" className="alert alert-error alert-soft">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
            <p className="text-sm text-center text-base-content/60">
              Reset links expire after 1 hour.{" "}
              <Link href="/auth/forgot-password" className="link font-medium">
                Request a new link
              </Link>
            </p>
          </div>
        )}

        {ready && !error && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <label className="form-control w-full">
              <div className="label py-2 px-1">
                <span className="label-text">New password</span>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                className="input input-bordered w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>

            <button type="submit" disabled={loading} className="btn btn-success w-full">
              {loading && <span className="loading loading-spinner loading-xs" />}
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        <p className="text-sm text-center">
          <Link href="/auth/signin" className="link">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
