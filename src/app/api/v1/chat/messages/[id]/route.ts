import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { editMessage, deleteMessage } from "@/services/ChatService";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: messageId } = await params;
    const body = await req.json();

    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Content is required for editing" }, { status: 400 });
    }

    const updated = await editMessage(messageId, session.userId, body.content, session.role);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("PUT /api/v1/chat/messages/[id] error:", error);
    const isForbidden = error.message?.includes("Unauthorized");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to edit message" },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: messageId } = await params;
    const deleted = await deleteMessage(messageId, session.userId, session.role);

    return NextResponse.json({ success: true, data: deleted });
  } catch (error: any) {
    console.error("DELETE /api/v1/chat/messages/[id] error:", error);
    const isForbidden = error.message?.includes("Unauthorized");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete message" },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
