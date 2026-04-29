import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import Logo from "@/components/Logo";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.replace("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-300">
      <div className="w-full max-w-lg bg-base-100 rounded-2xl shadow p-6 flex flex-col gap-6">

        <div className="self-center"><Logo size={60} /></div>

        {/* Heading */}
        <h1 className="text-4xl font-extrabold text-center text-base-content leading-tight">
          Sign in
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Email */}
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

          {/* Password */}
          <label className="form-control w-full">
            <div className="label py-2 px-1">
              <span className="label-text">Your password</span>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              className="input input-bordered w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-success w-full"
          >
            {loading && <span className="loading loading-spinner loading-xs" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Links */}
        <p className="text-sm text-center">
          <Link href="/auth/forgot-password" className="link">Forgot your password?</Link>
        </p>
        <p className="text-sm text-center">
          <Link href="/auth/signup" className="link">Don&apos;t have an account? Sign up</Link>
        </p>

      </div>
    </div>
  );
}
