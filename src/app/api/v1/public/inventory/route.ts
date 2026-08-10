import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get("sku");
    const productId = searchParams.get("productId");

    const whereCondition: any = { deletedAt: null };
    if (productId) whereCondition.id = productId;
    if (sku) whereCondition.OR = [{ sku }, { productCode: sku }];

    const products = await db.product.findMany({
      where: whereCondition,
      select: {
        id: true,
        sku: true,
        productCode: true,
        name: true,
        size: true,
        brand: { select: { name: true } },
        inventory: {
          select: {
            availableStock: true,
            transitStock: true,
            stockStatus: true,
          },
        },
      },
      take: 50,
    });

    // Strictly sanitize output to public fields ONLY
    const publicInventoryList = products.map((p) => ({
      product_id: p.id,
      sku: p.sku || p.productCode,
      tile_name: p.name,
      size: p.size || "Standard",
      brand: p.brand?.name || "Prestige",
      stock_available: p.inventory?.availableStock ?? 0,
      in_transit_stock: p.inventory?.transitStock ?? 0,
      status: p.inventory?.stockStatus ?? "OUT_OF_STOCK",
    }));

    return NextResponse.json({
      success: true,
      data: publicInventoryList,
    });
  } catch (error: any) {
    console.error("[PUBLIC INVENTORY API ERROR]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve public inventory data." },
      { status: 500 }
    );
  }
}
