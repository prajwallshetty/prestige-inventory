import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import { getProducts, createProduct } from "@/services/ProductService";
import type { Role } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const data = await getProducts({
      search: searchParams.get("search") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      brandId: searchParams.get("brandId") || undefined,
      collectionId: searchParams.get("collectionId") || undefined,
      productTypeId: searchParams.get("productTypeId") || undefined,
      status: searchParams.get("status") || undefined,
      published: searchParams.has("published") ? searchParams.get("published") === "true" : undefined,
      includeDeleted: searchParams.get("includeDeleted") === "true",
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "24", 10),
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("GET /api/v1/products error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch products" },
      { status: error.statusCode || 500 }
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
    const created = await createProduct(body, { userId: session.userId, role: session.role as Role, name: session.name });

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    console.error("POST /api/v1/products error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create product" },
      { status: error.statusCode || 500 }
    );
  }
}
