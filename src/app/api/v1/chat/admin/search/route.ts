import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { searchAllMessagesSuperAdmin } from "@/services/ChatService";

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
    const query = searchParams.get("query") || "";
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    const results = await searchAllMessagesSuperAdmin(query, limit);
    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error("GET /api/v1/chat/admin/search error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to search company chats" },
      { status: 500 }
    );
  }
}
