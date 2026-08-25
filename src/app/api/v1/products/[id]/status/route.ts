import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { deactivateProduct, reactivateProduct } from "@/services/ProductService";
import type { Role } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const actor = { userId: session.userId, role: session.role as Role, name: session.name };

    const updated =
      body.action === "reactivate" ? await reactivateProduct(id, actor) : await deactivateProduct(id, actor);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("PATCH /api/v1/products/[id]/status error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update product status" },
      { status: error.statusCode || 500 }
    );
  }
}
