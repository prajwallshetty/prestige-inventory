import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { getProductById, updateProduct, softDeleteProduct } from "@/services/ProductService";
import type { Role } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const product = await getProductById(id, { includeDeleted: true });
    return NextResponse.json({ success: true, data: product });
  } catch (error: any) {
    console.error("GET /api/v1/products/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch product" },
      { status: error.statusCode || 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const updated = await updateProduct(id, body, { userId: session.userId, role: session.role as Role, name: session.name });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("PUT /api/v1/products/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update product" },
      { status: error.statusCode || 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await softDeleteProduct(id, { userId: session.userId, role: session.role as Role, name: session.name });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/v1/products/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete product" },
      { status: error.statusCode || 500 }
    );
  }
}
