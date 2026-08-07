import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Path-gate the neutral domain: on the authvault.app host, ONLY the Upwork OAuth
// callback responds — every other path returns a blank 404. So a reviewer probing
// authvault.app finds nothing (no app, no freelancelog branding). On the app host
// (freelancelog.com) everything passes through untouched.
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const isNeutral = host === "authvault.app" || host.endsWith(".authvault.app");
  if (isNeutral && req.nextUrl.pathname !== "/api/upwork/callback") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
