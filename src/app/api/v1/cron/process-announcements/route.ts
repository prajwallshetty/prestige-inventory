import { NextRequest, NextResponse } from "next/server";
import { publishScheduledAnnouncements, expireAnnouncements } from "@/services/NotificationService";
import { assertCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Promotes due scheduled announcements and retires expired ones.
 *
 * Also runs on a timer inside the server process (`src/instrumentation.ts`);
 * this route exists for an external scheduler and for manual operation.
 */
async function handle(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

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
    return NextResponse.json({ success: false, error: "Announcement sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
