import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { quickCreateTaxonomy, type QuickCreateKind } from "@/services/ProductService";
import type { Role } from "@/lib/permissions";

const VALID_KINDS: QuickCreateKind[] = ["brand", "category", "collection"];

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!VALID_KINDS.includes(body.kind)) {
      return NextResponse.json({ success: false, error: "Invalid kind" }, { status: 400 });
    }
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }

    const created = await quickCreateTaxonomy(body.kind, body.name, {
      userId: session.userId,
      role: session.role as Role,
      name: session.name,
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    console.error("POST /api/v1/products/quick-create error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create" },
      { status: error.statusCode || 500 }
    );
  }
}
