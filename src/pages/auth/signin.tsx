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
    <div className="min-h-screen bg-base-200 flex items-center justify-center">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <h1 className="card-title justify-center text-2xl mb-2">UpworkToNotion</h1>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={["google"]}
            redirectTo={`${window.location.origin}/auth/callback`}
          />
        </div>
      </div>
    </div>
  );
}
