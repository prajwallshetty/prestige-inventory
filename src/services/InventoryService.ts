import { db } from "@/lib/db";
import { ACTIVE_BLOCK_STATUSES, PENDING_BLOCK_STATUSES } from "@/lib/permissions";

/**
 * THE single server-side definition of how much stock may still be blocked.
 *
 *   available = physical − currently blocked − allocated − damaged
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
  const [totalProducts, stockTotals, inventoryByStatus, blocksByStatus, inventoryItems] = await Promise.all([
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
    db.inventory.findMany({
      select: {
        totalStock: true,
        availableStock: true,
        blockedStock: true,
        transitStock: true,
        product: { select: { unit: true } },
      },
    }),
  ]);

  let boxTotal = 0, boxAvailable = 0, boxBlocked = 0, boxTransit = 0;
  let pcTotal = 0, pcAvailable = 0, pcBlocked = 0, pcTransit = 0;
  let bagTotal = 0, bagAvailable = 0, bagBlocked = 0, bagTransit = 0;

  for (const item of inventoryItems) {
    const unit = (item.product?.unit || "Box").toLowerCase();
    if (unit === "pc" || unit === "piece") {
      pcTotal += item.totalStock;
      pcAvailable += item.availableStock;
      pcBlocked += item.blockedStock;
      pcTransit += item.transitStock;
    } else if (unit === "bag") {
      bagTotal += item.totalStock;
      bagAvailable += item.availableStock;
      bagBlocked += item.blockedStock;
      bagTransit += item.transitStock;
    } else {
      boxTotal += item.totalStock;
      boxAvailable += item.availableStock;
      boxBlocked += item.blockedStock;
      boxTransit += item.transitStock;
    }
  }

  const inventoryCount = (status: string) =>
    inventoryByStatus.find((r) => r.stockStatus === status)?._count._all ?? 0;

  const countBlocksIn = (statuses: readonly string[]) =>
    blocksByStatus
      .filter((r) => statuses.includes(r.status))
      .reduce((sum, r) => sum + r._count._all, 0);

  return {
    totalProducts,
    stockDetails: {
      available: { box: boxAvailable, pc: pcAvailable, bag: bagAvailable },
      blocked: { box: boxBlocked, pc: pcBlocked, bag: bagBlocked },
      transit: { box: boxTransit, pc: pcTransit, bag: bagTransit },
      total: { box: boxTotal, pc: pcTotal, bag: bagTotal },
    },
    totalPhysicalStock: stockTotals._sum.totalStock || 0,
    totalAvailableStock: stockTotals._sum.availableStock || 0,
    totalBlockedStock: stockTotals._sum.blockedStock || 0,
    totalInTransit: stockTotals._sum.transitStock || 0,
    totalDelivered: stockTotals._sum.deliveredStock || 0,
    lowStock: inventoryCount("LOW_STOCK"),
    outOfStock: inventoryCount("OUT_OF_STOCK"),
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
  productTypeId?: string;
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

/** Free-text search across fields, multi-term tokenized with size/SKU normalization. */
export function productSearchClause(search: string) {
  const q = search.trim();
  if (!q) return undefined;

  const rawTerms = q.split(/[\s,+]+/).filter(Boolean).slice(0, 10);
  if (rawTerms.length === 0) return undefined;

  const like = (t: string) => ({ contains: t, mode: "insensitive" as const });

  return rawTerms.map((t) => {
    const variants = new Set<string>();
    variants.add(t);

    const clean = t.replace(/[^a-zA-Z0-9]/g, "");
    if (clean && clean !== t) {
      variants.add(clean);
    }

    const hyphenated = t.replace(/^([a-zA-Z]+)(\d+)$/, "$1-$2");
    if (hyphenated !== t) {
      variants.add(hyphenated);
    }

    const dimMatch = t.match(/^(\d+)\s*[xX\*\-]\s*(\d+)$/);
    if (dimMatch) {
      const d1 = parseInt(dimMatch[1], 10);
      const d2 = parseInt(dimMatch[2], 10);
      variants.add(`${d1}x${d2}`);
      variants.add(`${d1}X${d2}`);
      variants.add(`${d1} x ${d2}`);
      variants.add(`${d1} X ${d2}`);
      variants.add(`${d1}*${d2}`);

      if (d1 <= 200 && d2 <= 200) {
        const m1 = d1 * 10;
        const m2 = d2 * 10;
        variants.add(`${m1}x${m2}`);
        variants.add(`${m1}X${m2}`);
        variants.add(`${m1} x ${m2}`);
        variants.add(`${m1} X ${m2}`);
        variants.add(`${m1}*${m2}`);
      } else if (d1 >= 100 && d2 >= 100 && d1 % 10 === 0 && d2 % 10 === 0) {
        const c1 = d1 / 10;
        const c2 = d2 / 10;
        variants.add(`${c1}x${c2}`);
        variants.add(`${c1}X${c2}`);
        variants.add(`${c1} x ${c2}`);
        variants.add(`${c1} X ${c2}`);
      }
    }

    const termVariants = Array.from(variants);

    return {
      OR: termVariants.flatMap((v) => [
        { name: like(v) },
        { sku: like(v) },
        { productCode: like(v) },
        { importKey: like(v) },
        { size: like(v) },
        { collection: like(v) },
        { collectionRelation: { is: { name: like(v) } } },
        { finish: like(v) },
        { surface: like(v) },
        { color: like(v) },
        { material: like(v) },
        { texture: like(v) },
        { tag: like(v) },
        { description: like(v) },
        { shortDescription: like(v) },
        { brand: { is: { name: like(v) } } },
        { category: { is: { name: like(v) } } },
      ]),
    };
  });
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
  productTypeId,
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
  if (productTypeId) whereCondition.productTypeId = productTypeId;
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
  if (searchClause && searchClause.length > 0) {
    if (Array.isArray(whereCondition.AND)) {
      whereCondition.AND.push(...searchClause);
    } else if (whereCondition.AND) {
      whereCondition.AND = [whereCondition.AND, ...searchClause];
    } else {
      whereCondition.AND = searchClause;
    }
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where: whereCondition,
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
        productType: { select: { id: true, name: true, slug: true, icon: true } },
        unitRelation: { select: { id: true, name: true, symbol: true } },
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        inventory: {
          select: {
            id: true,
            brand: true,
            size: true,
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
      sku: p.sku || p.productCode || p.importKey || null,
      productName: p.name,
      productTypeId: (p as any).productType?.id || null,
      productTypeName: (p as any).productType?.name || "Tiles",
      productTypeSlug: (p as any).productType?.slug || "tiles",
      productTypeIcon: (p as any).productType?.icon || "Boxes",
      unitName: (p as any).unitRelation?.name || (p as any).unit || "Box",
      unitSymbol: (p as any).unitRelation?.symbol || "Box",
      size: p.size || inv?.size || null,
      collection: p.collection,
      finish: p.finish,
      brandName: p.brand?.name || inv?.brand || null,
      categoryName: p.category?.name || null,
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

export async function getInventoryFacets() {
  const [brands, categories, sizes, collections, productTypes] = await Promise.all([
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
    db.productType.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, icon: true, _count: { select: { products: true } } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return {
    brands: brands.map((b) => ({ value: b.id, label: b.name })),
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    sizes: sizes.map((s) => s.size!).filter(Boolean),
    collections: collections.map((c) => c.collection!).filter(Boolean),
    productTypes: productTypes.map((pt) => ({
      value: pt.id,
      label: pt.name,
      slug: pt.slug,
      icon: pt.icon,
      count: pt._count.products,
    })),
  };
}
