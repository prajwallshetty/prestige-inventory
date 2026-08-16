import { NextResponse } from "next/server";
import { popQueue } from "@/lib/redis";
import { createNotification } from "@/services/NotificationService";

export const dynamic = "force-dynamic";

export async function GET() {
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

    return NextResponse.json({
      success: true,
      processed: processedCount,
    });
  } catch (error: any) {
    console.error("[QUEUE WORKER ERROR]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
