import { useEffect } from "react";
import { useRouter } from "next/router";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import Logo from "@/components/Logo";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // PKCE flow: Supabase sends ?code= in the URL — must exchange it for a session
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        router.replace("/dashboard");
      });
      return;
    }

    // Fallback: implicit flow (hash fragment) or already-signed-in state
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-base-200">
      <Logo size={40} />
      <p className="text-sm text-base-content/50">Signing you in…</p>
    </div>
  );
}
