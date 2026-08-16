import { db } from "@/lib/db";

export async function getInventorySummary() {
  // Collapsed from 8 round trips to 4. The three stock sums share one
  // aggregate, and the per-status counts become groupBy rollups. Round-trip
  // latency dominates here, so query *count* matters more than query shape.
  const [totalProducts, stockTotals, inventoryByStatus, blocksByStatus] = await Promise.all([
    db.product.count({ where: { deletedAt: null } }),
    db.inventory.aggregate({
      _sum: { availableStock: true, blockedStock: true, transitStock: true },
    }),
    db.inventory.groupBy({ by: ["stockStatus"], _count: { _all: true } }),
    db.stockBlock.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const inventoryCount = (status: string) =>
    inventoryByStatus.find((r) => r.stockStatus === status)?._count._all ?? 0;
  const blockCount = (status: string) =>
    blocksByStatus.find((r) => r.status === status)?._count._all ?? 0;

  return {
    totalProducts,
    totalAvailableStock: stockTotals._sum.availableStock || 0,
    totalBlockedStock: stockTotals._sum.blockedStock || 0,
    totalInTransit: stockTotals._sum.transitStock || 0,
    lowStock: inventoryCount("LOW_STOCK"),
    outOfStock: inventoryCount("OUT_OF_STOCK"),
    activeBlocks: blockCount("APPROVED"),
    pendingBlocks: blockCount("PENDING"),
  };
}

export async function getInventoryList({
  search,
  brandId,
  categoryId,
  stockStatus,
  page = 1,
  limit = 20,
  userRole,
  warehouseId,
}: {
  search?: string;
  brandId?: string;
  categoryId?: string;
  stockStatus?: string;
  page?: number;
  limit?: number;
  userRole?: string;
  warehouseId?: string;
}) {
  const skip = (page - 1) * limit;

  const whereCondition: any = {
    deletedAt: null,
  };

  if (brandId) whereCondition.brandId = brandId;
  if (categoryId) whereCondition.categoryId = categoryId;

  // Restrict to warehouse or stock status if specified
  if (warehouseId || stockStatus) {
    whereCondition.inventory = {
      ...(warehouseId ? { warehouseId } : {}),
      ...(stockStatus ? { stockStatus } : {}),
    };
  }

  if (search) {
    whereCondition.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { productCode: { contains: search, mode: "insensitive" } },
      { size: { contains: search, mode: "insensitive" } },
    ];
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where: whereCondition,
      // `select`, not `include` — the mapper below uses ~12 fields, while
      // `include` dragged every Product column plus full Inventory rows and
      // unbounded StockBlock history into the RSC payload for every row.
      select: {
        id: true,
        name: true,
        sku: true,
        productCode: true,
        size: true,
        image_key: true,
        thumbnail_key: true,
        lifestyleImage: true,
        textureImage: true,
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        inventory: {
          select: {
            id: true,
            availableStock: true,
            blockedStock: true,
            allocatedStock: true,
            damagedStock: true,
            transitStock: true,
            minimumStock: true,
            reorderLevel: true,
            stockStatus: true,
            warehouse: { select: { id: true, name: true, code: true } },
            stockBlocks: {
              where: { status: { in: ["APPROVED", "PENDING"] } },
              orderBy: { createdAt: "desc" },
              take: 5,
              select: {
                id: true,
                quantity: true,
                status: true,
                requestedBy: true,
                createdAt: true,
              },
            },
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    db.product.count({ where: whereCondition }),
  ]);

  // Transform and calculate real-time status if inventory row missing
  const items = products.map((p) => {
    const inv = p.inventory || {
      availableStock: 0,
      blockedStock: 0,
      allocatedStock: 0,
      damagedStock: 0,
      transitStock: 0,
      minimumStock: 0,
      reorderLevel: 0,
      stockStatus: "OUT_OF_STOCK",
      warehouse: { name: "Main Central Depot", code: "MAIN-DEPOT", id: "" },
      stockBlocks: [],
    };

    let calculatedStatus = inv.stockStatus;
    if (inv.availableStock <= 0) {
      calculatedStatus = inv.transitStock > 0 ? "INCOMING" : "OUT_OF_STOCK";
    } else if (inv.reorderLevel > 0 && inv.availableStock <= inv.reorderLevel) {
      calculatedStatus = "LOW_STOCK";
    } else {
      calculatedStatus = "AVAILABLE";
    }

    const isDealer = userRole === "DEALER";

    // Strip internal attributes if role is DEALER
    return {
      id: p.id,
      sku: p.sku || p.productCode || p.id.slice(-6).toUpperCase(),
      productName: p.name,
      size: p.size || "Standard",
      brandName: p.brand?.name || "Unbranded",
      categoryName: p.category?.name || "General",
      image_key: p.image_key,
      thumbnail_key: p.thumbnail_key,
      lifestyleImage: p.lifestyleImage,
      textureImage: p.textureImage,
      availableStock: inv.availableStock,
      
      // Stripped attributes for dealers
      blockedStock: isDealer ? 0 : inv.blockedStock,
      allocatedStock: isDealer ? 0 : inv.allocatedStock,
      transitStock: inv.transitStock,
      damagedStock: isDealer ? 0 : inv.damagedStock,
      minimumStock: isDealer ? 0 : inv.minimumStock,
      reorderLevel: isDealer ? 0 : inv.reorderLevel,
      status: calculatedStatus,
      warehouseName: inv.warehouse?.name || "Main Central Depot",
      inventoryId: p.inventory?.id || null,
      
      // Strip blocks list detail for dealers
      activeBlocks: isDealer ? [] : (inv.stockBlocks || []).map((sb) => ({
        id: sb.id,
        quantity: sb.quantity,
        status: sb.status,
        requestedBy: sb.requestedBy,
        blocked_by: null, // strip controller ID
        remarks: null,    // strip internal remarks
        createdAt: sb.createdAt,
      })),
    };
  });

  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
