import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { getConversationDetails } from "@/services/ChatService";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const conversation = await getConversationDetails(id, session.userId, session.role);

    return NextResponse.json({ success: true, data: conversation });
  } catch (error: any) {
    const isForbidden = error.message?.includes("Unauthorized");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch conversation details" },
      { status: isForbidden ? 403 : 500 }
    );
  }
}
