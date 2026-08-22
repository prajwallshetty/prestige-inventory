import { NextRequest, NextResponse } from "next/server";
import { popQueue } from "@/lib/redis";
import { createNotification } from "@/services/NotificationService";
import { assertCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/** Drains the deferred notification queue. Machine-only, like the other jobs. */
async function handle(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  let processedCount = 0;
  const maxPerBatch = 20;

  try {
    for (let i = 0; i < maxPerBatch; i++) {
      const job = await popQueue("notification_queue");
      if (!job) break;

      if (job.userId && job.title && job.message) {
        await createNotification({
          userId: job.userId,
          type: job.type || "GENERAL_ANNOUNCEMENT",
          title: job.title,
          message: job.message,
          priority: job.priority || "NORMAL",
          data: job.data,
        });
        processedCount++;
      }
    }

    return NextResponse.json({ success: true, processed: processedCount });
  } catch (error: any) {
    console.error("[QUEUE WORKER ERROR]:", error);
    return NextResponse.json({ success: false, error: "Queue worker failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
