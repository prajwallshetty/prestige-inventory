import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { markConversationAsRead } from "@/services/ChatService";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const res = await markConversationAsRead(conversationId, session.userId);

    return NextResponse.json({ ...res });
  } catch (error: any) {
    console.error("POST /api/v1/chat/conversations/[id]/read error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to mark conversation read" },
      { status: 500 }
    );
  }
}
