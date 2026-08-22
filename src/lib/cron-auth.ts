import { NextRequest, NextResponse } from "next/server";

/**
 * Shared guard for the scheduled-job endpoints.
 *
 * Accepts either `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron
 * sends) or `?key=<CRON_SECRET>`. When `CRON_SECRET` is unset the routes are
 * refused outright rather than left open — an expiry sweep that anyone can
 * trigger is a denial-of-service lever against the database.
 *
 * Returns a response to send when the request is not authorised, or null when
 * it is.
 */
export function assertCronAuthorized(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Local development convenience: allow loopback callers only.
    const host = req.headers.get("host") ?? "";
    if (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
      return null;
    }
    return NextResponse.json(
      { success: false, error: "Scheduled jobs are disabled: CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const queryKey = req.nextUrl.searchParams.get("key");

  if (bearer === secret || queryKey === secret) return null;

  return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
}
