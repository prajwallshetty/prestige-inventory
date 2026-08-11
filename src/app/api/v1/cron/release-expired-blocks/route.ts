import { NextResponse } from "next/server";
import { releaseExpiredBlocks } from "@/services/StockBlockService";
import { releaseExpiredBookings } from "@/services/BookingService";

export async function GET() {
  try {
    const [blocksResult, bookingsResult] = await Promise.all([
      releaseExpiredBlocks(),
      releaseExpiredBookings(),
    ]);
    return NextResponse.json({
      success: true,
      message: `Processed expired blocks and bookings auto-release.`,
      result: {
        blocks: blocksResult,
        bookings: bookingsResult,
      },
    });
  } catch (error: any) {
    console.error("[CRON EXPIRED RESERVATIONS ERROR]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
