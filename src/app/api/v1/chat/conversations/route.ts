import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import {
  getConversationsForUser,
  getOrCreateDirectConversation,
  createGroupConversation,
} from "@/services/ChatService";

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const isSuperAdminView = searchParams.get("adminView") === "true";

    const data = await getConversationsForUser(session.userId, {
      userRole: session.role,
      isSuperAdminView,
      search,
      page,
      limit,
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("GET /api/v1/chat/conversations error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type = "DIRECT", partnerUserId, name, description, participantIds, blockId, shipmentId } = body;

    if (type === "DIRECT") {
      if (!partnerUserId) {
        return NextResponse.json({ success: false, error: "partnerUserId is required for direct chat" }, { status: 400 });
      }
      const conversation = await getOrCreateDirectConversation(session.userId, partnerUserId);
      return NextResponse.json({ success: true, data: conversation });
    }

    if (type === "GROUP") {
      if (!name) {
        return NextResponse.json({ success: false, error: "Group name is required" }, { status: 400 });
      }

      // Check RBAC permission for creating groups (SUPER_ADMIN, MANAGER, SHOWROOM_INCHARGE)
      const allowedRoles = ["SUPER_ADMIN", "MANAGER", "SHOWROOM_INCHARGE"];
      if (!allowedRoles.includes(session.role)) {
        return NextResponse.json(
          { success: false, error: "Only Admins, Managers, and In-Charges can create group channels" },
          { status: 403 }
        );
      }

      const conversation = await createGroupConversation({
        name,
        description,
        createdBy: session.userId,
        participantIds: participantIds || [],
        blockId,
        shipmentId,
      });

      return NextResponse.json({ success: true, data: conversation });
    }

    return NextResponse.json({ success: false, error: "Invalid conversation type" }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/v1/chat/conversations error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create conversation" },
      { status: 500 }
    );
  }
}
