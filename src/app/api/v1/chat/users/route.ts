import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { searchChatUsers } from "@/services/ChatService";

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const users = await searchChatUsers(query, session.userId, limit);
    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    console.error("GET /api/v1/chat/users error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to search users" },
      { status: 500 }
    );
  }
}
