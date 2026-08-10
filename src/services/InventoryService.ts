import { db } from "@/lib/db";

export async function getInventorySummary() {
  const [totalProducts, availableStock, blockedStock, transitStock, lowStockCount, outOfStockCount, activeBlocks, pendingBlocks] = await Promise.all([
    db.product.count({ where: { deletedAt: null } }),
    db.inventory.aggregate({ _sum: { availableStock: true } }),
    db.inventory.aggregate({ _sum: { blockedStock: true } }),
    db.inventory.aggregate({ _sum: { transitStock: true } }),
    db.inventory.count({ where: { stockStatus: "LOW_STOCK" } }),
    db.inventory.count({ where: { stockStatus: "OUT_OF_STOCK" } }),
    db.stockBlock.count({ where: { status: "APPROVED" } }),
    db.stockBlock.count({ where: { status: "PENDING" } }),
  ]);

  return {
    totalProducts,
    totalAvailableStock: availableStock._sum.availableStock || 0,
    totalBlockedStock: blockedStock._sum.blockedStock || 0,
    totalInTransit: transitStock._sum.transitStock || 0,
    lowStock: lowStockCount,
    outOfStock: outOfStockCount,
    activeBlocks,
    pendingBlocks,
  };
}

export async function getInventoryList({
  search,
  brandId,
  categoryId,
  stockStatus,
  page = 1,
  limit = 20,
}: {
  search?: string;
  brandId?: string;
  categoryId?: string;
  stockStatus?: string;
  page?: number;
  limit?: number;
}) {
  const skip = (page - 1) * limit;

  const whereCondition: any = {
    deletedAt: null,
  };

  if (brandId) whereCondition.brandId = brandId;
  if (categoryId) whereCondition.categoryId = categoryId;

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
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        inventory: {
          include: {
            warehouse: { select: { id: true, name: true, code: true } },
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
    };

    let calculatedStatus = inv.stockStatus;
    if (inv.availableStock <= 0) {
      calculatedStatus = inv.transitStock > 0 ? "INCOMING" : "OUT_OF_STOCK";
    } else if (inv.reorderLevel > 0 && inv.availableStock <= inv.reorderLevel) {
      calculatedStatus = "LOW_STOCK";
    } else {
      calculatedStatus = "AVAILABLE";
    }

    return {
      id: p.id,
      sku: p.sku || p.productCode || p.id.slice(-6).toUpperCase(),
      productName: p.name,
      size: p.size || "Standard",
      brandName: p.brand?.name || "Unbranded",
      categoryName: p.category?.name || "General",
      lifestyleImage: p.lifestyleImage || p.textureImage || null,
      availableStock: inv.availableStock,
      blockedStock: inv.blockedStock,
      allocatedStock: inv.allocatedStock,
      transitStock: inv.transitStock,
      damagedStock: inv.damagedStock,
      minimumStock: inv.minimumStock,
      reorderLevel: inv.reorderLevel,
      status: calculatedStatus,
      warehouseName: inv.warehouse?.name || "Main Central Depot",
      inventoryId: p.inventory?.id || null,
    };
  });

  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
