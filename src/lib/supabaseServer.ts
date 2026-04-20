import { createServerClient } from "@supabase/ssr";
import type { NextApiRequest, NextApiResponse } from "next";

export function getSupabaseServer(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies ?? {}).map(([name, value]) => ({
            name,
            value: value ?? "",
          }));
        },
        setAll(cookies) {
          const vals = cookies.map(
            ({ name, value, options }) =>
              `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${options?.secure ? "; Secure" : ""}${options?.maxAge ? `; Max-Age=${options.maxAge}` : ""}`,
          );
          if (vals.length) res.setHeader("Set-Cookie", vals);
        },
      },
    },
  );
}
