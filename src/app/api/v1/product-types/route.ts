import { NextResponse } from "next/server";
import { getProductTypes, createProductType, getProductCategoryBreakdown } from "@/services/ProductTypeService";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeBreakdown = searchParams.get("breakdown") === "true";
    const all = searchParams.get("all") === "true";

    const productTypes = await getProductTypes(!all);

    if (includeBreakdown) {
      const categoryBreakdown = await getProductCategoryBreakdown();
      return NextResponse.json({
        success: true,
        data: productTypes,
        breakdown: categoryBreakdown,
      });
    }

    return NextResponse.json({
      success: true,
      data: productTypes,
    });
  } catch (error: any) {
    console.error("GET /api/v1/product-types error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch Product Types" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: "Product Type name is required" },
        { status: 400 }
      );
    }

    const created = await createProductType({
      name: body.name,
      description: body.description,
      icon: body.icon,
      image: body.image,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    });

    return NextResponse.json({
      success: true,
      data: created,
    });
  } catch (error: any) {
    console.error("POST /api/v1/product-types error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create Product Type" },
      { status: 500 }
    );
  }
}
