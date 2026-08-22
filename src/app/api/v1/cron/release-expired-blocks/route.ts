import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredBlocks } from "@/services/StockBlockService";
import { releaseExpiredBookings } from "@/services/BookingService";
import { assertCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Expiry worker endpoint.
 *
 * Previously an unauthenticated public GET — anyone who knew the URL could
 * drive the expiry sweep. It now requires the shared cron secret, and the
 * same work is additionally scheduled in-process (see `src/instrumentation.ts`)
 * so expiry no longer depends on an external caller (spec §16).
 */
async function handle(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const [blocksResult, bookingsResult] = await Promise.all([
      releaseExpiredBlocks(),
      releaseExpiredBookings(),
    ]);

    return NextResponse.json({
      success: true,
      message: "Processed expired blocks and bookings.",
      result: { blocks: blocksResult, bookings: bookingsResult },
    });
  } catch (error: any) {
    console.error("[CRON EXPIRED RESERVATIONS ERROR]:", error);
    // The caller is a machine, but the message still must not leak internals.
    return NextResponse.json({ success: false, error: "Expiry sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
