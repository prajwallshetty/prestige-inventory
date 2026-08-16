import { NextResponse } from "next/server";
import { publishScheduledAnnouncements, expireAnnouncements } from "@/services/NotificationService";

/**
 * Promotes due scheduled announcements and retires expired ones.
 *
 * Without this the `scheduledAt` / `expiresAt` columns are inert — an
 * announcement scheduled for later would simply never be delivered. Point a
 * scheduler at this route (Vercel Cron, an external pinger, etc.); a few
 * minutes' granularity is fine.
 */
export async function GET() {
  try {
    const [scheduled, expired] = await Promise.all([
      publishScheduledAnnouncements(),
      expireAnnouncements(),
    ]);

    return NextResponse.json({
      success: true,
      message: `Published ${scheduled.published} scheduled announcement(s), expired ${expired.expired}.`,
      result: { scheduled, expired },
    });
  } catch (error: any) {
    console.error("[CRON ANNOUNCEMENTS ERROR]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
