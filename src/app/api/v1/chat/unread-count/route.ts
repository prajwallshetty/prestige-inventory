import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { getUnreadChatCount } from "@/services/ChatService";

export async function GET() {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const unreadCount = await getUnreadChatCount(session.userId);
    return NextResponse.json({ success: true, unreadCount });
  } catch (error: any) {
    console.error("GET /api/v1/chat/unread-count error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch unread count" },
      { status: 500 }
    );
  }
}
