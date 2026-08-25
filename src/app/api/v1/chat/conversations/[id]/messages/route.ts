import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { getMessages, sendMessage } from "@/services/ChatService";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const beforeId = searchParams.get("beforeId") || undefined;
    const search = searchParams.get("search") || undefined;

    const data = await getMessages(conversationId, session.userId, session.role, {
      limit,
      beforeId,
      search,
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("GET /api/v1/chat/conversations/[id]/messages error:", error);
    const isForbidden = error.message?.includes("Unauthorized");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch messages" },
      { status: isForbidden ? 403 : 500 }
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const body = await req.json();

    const message = await sendMessage({
      conversationId,
      senderId: session.userId,
      type: body.type || "TEXT",
      content: body.content,
      attachmentUrl: body.attachmentUrl,
      attachmentKey: body.attachmentKey,
      attachmentName: body.attachmentName,
      replyToId: body.replyToId,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
      userRole: session.role,
      clientMessageId: body.clientMessageId,
    });

    return NextResponse.json({ success: true, data: message });
  } catch (error: any) {
    console.error("POST /api/v1/chat/conversations/[id]/messages error:", error);
    const isForbidden = error.message?.includes("not a participant");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to send message" },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
