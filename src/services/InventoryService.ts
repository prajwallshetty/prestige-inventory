import { db } from "@/lib/db";
import { ACTIVE_BLOCK_STATUSES, PENDING_BLOCK_STATUSES } from "@/lib/permissions";

/**
 * THE single server-side definition of how much stock may still be blocked.
 *
 *   available = physical − currently blocked − allocated − damaged
 *
 * `blockedStock` is a running counter maintained by StockBlockService: it is
 * incremented on reservation and decremented on reject/cancel/release/expire,
 * so expired, cancelled, released, rejected and delivered blocks are already
 * excluded (spec §6). Both the booking form and the server-side validation call
 * this, so the number shown can never disagree with the number enforced.
 */
export function computeAvailableToBlock(inv: {
  totalStock: number;
  blockedStock: number;
  allocatedStock: number;
  damagedStock: number;
  reservedStock?: number;
}): number {
  return Math.max(
    0,
    inv.totalStock - inv.blockedStock - inv.allocatedStock - inv.damagedStock - (inv.reservedStock ?? 0)
  );
}

export async function getAvailableToBlock(productId: string): Promise<number> {
  const inv = await db.inventory.findUnique({
    where: { productId },
    select: {
      totalStock: true,
      blockedStock: true,
      allocatedStock: true,
      damagedStock: true,
      reservedStock: true,
    },
  });
  if (!inv) return 0;
  return computeAvailableToBlock(inv);
}

export async function getInventorySummary() {
  const [totalProducts, stockTotals, inventoryByStatus, blocksByStatus] = await Promise.all([
    db.product.count({ where: { deletedAt: null } }),
    db.inventory.aggregate({
      _sum: {
        totalStock: true,
        availableStock: true,
        blockedStock: true,
        transitStock: true,
        deliveredStock: true,
      },
    }),
    db.inventory.groupBy({ by: ["stockStatus"], _count: { _all: true } }),
    db.stockBlock.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const inventoryCount = (status: string) =>
    inventoryByStatus.find((r) => r.stockStatus === status)?._count._all ?? 0;

  const countBlocksIn = (statuses: readonly string[]) =>
    blocksByStatus
      .filter((r) => statuses.includes(r.status))
      .reduce((sum, r) => sum + r._count._all, 0);

  return {
    totalProducts,
    totalPhysicalStock: stockTotals._sum.totalStock || 0,
    totalAvailableStock: stockTotals._sum.availableStock || 0,
    totalBlockedStock: stockTotals._sum.blockedStock || 0,
    totalInTransit: stockTotals._sum.transitStock || 0,
    totalDelivered: stockTotals._sum.deliveredStock || 0,
    lowStock: inventoryCount("LOW_STOCK"),
    outOfStock: inventoryCount("OUT_OF_STOCK"),
    // Counted against the real state machine — the previous implementation
    // looked for the statuses "APPROVED" and "PENDING", the second of which
    // has never existed, so both tiles read zero or near-zero.
    activeBlocks: countBlocksIn(ACTIVE_BLOCK_STATUSES),
    pendingBlocks: countBlocksIn(PENDING_BLOCK_STATUSES),
    readyToShip: countBlocksIn(["READY_TO_SHIP"]),
    shipped: countBlocksIn(["SHIPPED", "PARTIALLY_SHIPPED"]),
  };
}

export interface InventoryFilters {
  search?: string;
  brandId?: string;
  categoryId?: string;
  collection?: string;
  size?: string;
  finish?: string;
  stockStatus?: string;
  page?: number;
  limit?: number;
  sort?: string;
  userRole?: string;
  warehouseId?: string;
}

/** Free-text search across the fields §18 lists, one AND-ed clause per term. */
function productSearchClause(search: string) {
  const terms = search.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (terms.length === 0) return undefined;

  const like = (t: string) => ({ contains: t, mode: "insensitive" as const });

  return terms.map((t) => ({
    OR: [
      { name: like(t) },
      { sku: like(t) },
      { productCode: like(t) },
      { importKey: like(t) },
      { size: like(t) },
      { collection: like(t) },
      { finish: like(t) },
      { surface: like(t) },
      { color: like(t) },
      { material: like(t) },
      { brand: { is: { name: like(t) } } },
      { category: { is: { name: like(t) } } },
    ],
  }));
}

const INVENTORY_SORTS: Record<string, any> = {
  newest: { createdAt: "desc" },
  name_asc: { name: "asc" },
  name_desc: { name: "desc" },
  stock_asc: { inventory: { availableStock: "asc" } },
  stock_desc: { inventory: { availableStock: "desc" } },
};

export async function getInventoryList({
  search,
  brandId,
  categoryId,
  collection,
  size,
  finish,
  stockStatus,
  page = 1,
  limit = 20,
  sort = "newest",
  userRole,
  warehouseId,
}: InventoryFilters) {
  const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
  const safePage = Math.max(page || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const whereCondition: any = { deletedAt: null };

  if (brandId) whereCondition.brandId = brandId;
  if (categoryId) whereCondition.categoryId = categoryId;
  if (collection) whereCondition.collection = { contains: collection, mode: "insensitive" };
  if (size) whereCondition.size = { contains: size, mode: "insensitive" };
  if (finish) whereCondition.finish = { contains: finish, mode: "insensitive" };

  if (warehouseId || stockStatus) {
    whereCondition.inventory = {
      is: {
        ...(warehouseId ? { warehouseId } : {}),
        ...(stockStatus ? { stockStatus } : {}),
      },
    };
  }

  const searchClause = search ? productSearchClause(search) : undefined;
  if (searchClause) whereCondition.AND = searchClause;

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
        importKey: true,
        size: true,
        collection: true,
        finish: true,
        image_key: true,
        thumbnail_key: true,
        lifestyleImage: true,
        textureImage: true,
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        inventory: {
          select: {
            id: true,
            totalStock: true,
            availableStock: true,
            blockedStock: true,
            allocatedStock: true,
            damagedStock: true,
            transitStock: true,
            deliveredStock: true,
            minimumStock: true,
            reorderLevel: true,
            stockStatus: true,
            warehouse: { select: { id: true, name: true, code: true } },
            stockBlocks: {
              // Active holds only — the previous filter looked for the
              // non-existent status "PENDING" alongside "APPROVED".
              where: { status: { in: [...ACTIVE_BLOCK_STATUSES] } },
              orderBy: { createdAt: "desc" },
              take: 5,
              select: {
                id: true,
                block_number: true,
                quantity: true,
                status: true,
                requestedBy: true,
                blocked_by: true,
                createdAt: true,
                expiresAt: true,
              },
            },
          },
        },
      },
      skip,
      take: safeLimit,
      orderBy: INVENTORY_SORTS[sort] ?? INVENTORY_SORTS.newest,
    }),
    db.product.count({ where: whereCondition }),
  ]);

  const items = products.map((p) => {
    const inv = p.inventory;
    const totalStock = inv?.totalStock ?? 0;
    const blockedStock = inv?.blockedStock ?? 0;
    const allocatedStock = inv?.allocatedStock ?? 0;
    const damagedStock = inv?.damagedStock ?? 0;
    const transitStock = inv?.transitStock ?? 0;
    const reorderLevel = inv?.reorderLevel ?? 0;

    // Derived here as well as in the database so a stale column never shows a
    // number the block form would then refuse.
    const availableStock = computeAvailableToBlock({
      totalStock,
      blockedStock,
      allocatedStock,
      damagedStock,
    });

    let status: string;
    if (availableStock <= 0) {
      status = transitStock > 0 ? "INCOMING" : totalStock <= 0 ? "OUT_OF_STOCK" : "BLOCKED";
    } else if (reorderLevel > 0 && availableStock <= reorderLevel) {
      status = "LOW_STOCK";
    } else {
      status = "AVAILABLE";
    }

    return {
      id: p.id,
      sku: p.sku || p.productCode || p.importKey || p.id.slice(-6).toUpperCase(),
      productName: p.name,
      size: p.size || "Standard",
      collection: p.collection,
      finish: p.finish,
      brandName: p.brand?.name || "Unbranded",
      categoryName: p.category?.name || "General",
      image_key: p.image_key,
      thumbnail_key: p.thumbnail_key,
      lifestyleImage: p.lifestyleImage,
      textureImage: p.textureImage,
      totalStock,
      availableStock,
      blockedStock,
      allocatedStock,
      transitStock,
      damagedStock,
      deliveredStock: inv?.deliveredStock ?? 0,
      minimumStock: inv?.minimumStock ?? 0,
      reorderLevel,
      status,
      warehouseName: inv?.warehouse?.name || "Main Central Depot",
      inventoryId: inv?.id || null,
      activeBlocks: (inv?.stockBlocks || []).map((sb) => ({
        id: sb.id,
        blockNumber: sb.block_number,
        quantity: sb.quantity,
        status: sb.status,
        requestedBy: sb.requestedBy,
        blocked_by: sb.blocked_by,
        createdAt: sb.createdAt,
        expiresAt: sb.expiresAt,
      })),
    };
  });

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

/**
 * Server-side product search for the block creation selector.
 *
 * Returns a small, capped result set with only the fields the picker renders —
 * the catalogue is ~1,100 rows and growing, so it must never be shipped to the
 * browser wholesale (spec §7, §19).
 */
export async function searchBlockableProducts({
  query,
  limit = 10,
}: {
  query: string;
  limit?: number;
}) {
  const q = (query || "").trim();
  if (q.length < 2) return [];

  const clause = productSearchClause(q);

  const products = await db.product.findMany({
    where: { deletedAt: null, status: "ACTIVE", ...(clause ? { AND: clause } : {}) },
    select: {
      id: true,
      name: true,
      sku: true,
      productCode: true,
      importKey: true,
      size: true,
      thumbnail_key: true,
      image_key: true,
      brand: { select: { name: true } },
      inventory: {
        select: {
      totalStock: true,
      blockedStock: true,
      allocatedStock: true,
      damagedStock: true,
      reservedStock: true,
    },
      },
    },
    take: Math.min(limit, 25),
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    productNumber: p.sku || p.productCode || p.importKey || "—",
    size: p.size,
    brand: p.brand?.name ?? null,
    thumbnailKey: p.thumbnail_key || p.image_key || null,
    availableToBlock: p.inventory ? computeAvailableToBlock(p.inventory) : 0,
  }));
}

/**
 * Distinct facet values for the inventory filter bar. Cheap enough to run per
 * request against ~1k products, and it keeps the filters honest — only values
 * that actually exist are offered.
 */
export async function getInventoryFacets() {
  const [brands, categories, sizes, collections] = await Promise.all([
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({
      where: { deletedAt: null, size: { not: null } },
      select: { size: true },
      distinct: ["size"],
      orderBy: { size: "asc" },
      take: 60,
    }),
    db.product.findMany({
      where: { deletedAt: null, collection: { not: null } },
      select: { collection: true },
      distinct: ["collection"],
      orderBy: { collection: "asc" },
      take: 60,
    }),
  ]);

  return {
    brands,
    categories,
    sizes: sizes.map((s) => s.size!).filter(Boolean),
    collections: collections.map((c) => c.collection!).filter(Boolean),
  };
}
