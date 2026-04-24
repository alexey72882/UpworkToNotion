import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import Logo from "@/components/Logo";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await getSupabaseBrowser().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setConfirm(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-300">
      <div className="w-full max-w-lg bg-base-100 rounded-2xl shadow p-6 flex flex-col gap-6">

        <Logo size={60} />

        <h1 className="text-4xl font-extrabold text-center text-base-content leading-tight">
          Create account
        </h1>

        {confirm ? (
          <div role="alert" className="alert alert-success alert-outline bg-[color-mix(in_oklch,var(--color-success)_10%,var(--color-base-100))]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Check your email to confirm your account, then{" "}
            <Link href="/auth/signin" className="link font-medium">sign in</Link>.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <label className="form-control w-full">
              <div className="label py-2 px-1">
                <span className="label-text">Email address</span>
              </div>
              <input
                type="email"
                placeholder="you@example.com"
                className="input input-bordered w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="form-control w-full">
              <div className="label py-2 px-1">
                <span className="label-text">Password</span>
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

            {error && (
              <div role="alert" className="alert alert-error alert-outline bg-base-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-success w-full">
              {loading && <span className="loading loading-spinner loading-xs" />}
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}

        <p className="text-sm text-center">
          <Link href="/auth/signin" className="link">Already have an account? Sign in</Link>
        </p>
      </div>
    </div>
  );
}
