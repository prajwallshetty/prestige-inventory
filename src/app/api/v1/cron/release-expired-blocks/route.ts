import { NextResponse } from "next/server";
import { releaseExpiredBlocks } from "@/services/StockBlockService";

export async function GET() {
  try {
    const result = await releaseExpiredBlocks();
    return NextResponse.json({
      success: true,
      message: `Processed expired blocks auto-release.`,
      result,
    });
  } catch (error: any) {
    console.error("[CRON EXPIRED BLOCKS ERROR]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
