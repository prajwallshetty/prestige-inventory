import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { getSuperAdminChatMonitorStats, getConversationsForUser } from "@/services/ChatService";

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Access denied. Super Admin role required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const search = searchParams.get("search") || "";

    const [stats, conversationsData] = await Promise.all([
      getSuperAdminChatMonitorStats(),
      getConversationsForUser(session.userId, {
        userRole: session.role,
        isSuperAdminView: true,
        search,
        page,
        limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      stats,
      conversations: conversationsData.items,
      total: conversationsData.total,
      page: conversationsData.page,
      totalPages: conversationsData.totalPages,
    });
  } catch (error: any) {
    console.error("GET /api/v1/chat/admin/monitor error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch chat monitor stats" },
      { status: 500 }
    );
  }
}
