import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/dashboard", "/settings"];

export async function proxy(request: NextRequest) {
  // Path-gate the neutral authvault.app host: only the Upwork OAuth callback
  // responds there — every other path returns a blank 404, so a reviewer probing
  // authvault.app finds nothing (no app, no freelancelog branding).
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (
    (host === "authvault.app" || host.endsWith(".authvault.app")) &&
    request.nextUrl.pathname !== "/api/upwork/callback"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  // Refresh session — this also writes updated cookies to response
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
