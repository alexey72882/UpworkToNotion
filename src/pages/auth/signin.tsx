import { useState } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import type { SupabaseClient } from "@supabase/supabase-js";

export default function SignIn() {
  const [supabase] = useState<SupabaseClient | null>(() =>
    typeof window === "undefined" ? null : getSupabaseBrowser()
  );

  if (!supabase) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold text-center mb-6">UpworkToNotion</h1>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={["google"]}
          redirectTo={`${window.location.origin}/auth/callback`}
        />
      </div>
    </div>
  );
}
