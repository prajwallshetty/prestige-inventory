import { db } from "@/lib/db";
import { ACTIVE_BLOCK_STATUSES, PENDING_BLOCK_STATUSES, AppError } from "@/lib/permissions";

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

/** Same bucketing rule as the JS version this replaced: pc/piece/nos → "pc", bag → "bag", else "box". */
const UNIT_BUCKET_SQL = `
  SELECT
    CASE
      WHEN LOWER(COALESCE(NULLIF(u.name, ''), NULLIF(u.symbol, ''), NULLIF(p.unit, ''), 'Box')) LIKE '%pc%'
        OR LOWER(COALESCE(NULLIF(u.name, ''), NULLIF(u.symbol, ''), NULLIF(p.unit, ''), 'Box')) LIKE '%piece%'
        OR LOWER(COALESCE(NULLIF(u.name, ''), NULLIF(u.symbol, ''), NULLIF(p.unit, ''), 'Box')) LIKE '%nos%'
        THEN 'pc'
      WHEN LOWER(COALESCE(NULLIF(u.name, ''), NULLIF(u.symbol, ''), NULLIF(p.unit, ''), 'Box')) LIKE '%bag%'
        THEN 'bag'
      ELSE 'box'
    END AS bucket,
    SUM(i."totalStock")::float AS total,
    SUM(i."availableStock")::float AS available,
    SUM(i."blockedStock")::float AS blocked,
    SUM(i."transitStock")::float AS transit
  FROM "Inventory" i
  JOIN "Product" p ON p.id = i."productId"
  LEFT JOIN "Unit" u ON u.id = p."unitId"
  GROUP BY bucket
`;

interface UnitBucketRow {
  bucket: "pc" | "bag" | "box";
  total: number;
  available: number;
  blocked: number;
  transit: number;
}

export async function getInventorySummary() {
  const [totalProducts, stockTotals, inventoryByStatus, blocksByStatus, unitBuckets] = await Promise.all([
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
    // Grouped in SQL rather than pulling every Inventory row (+ nested
    // product/unit) into Node to bucket by hand — was the single largest
    // contributor to dashboard load time (docs/AUDIT.md-style finding: ~3-5s
    // in isolation against the live catalog).
    db.$queryRawUnsafe(UNIT_BUCKET_SQL) as Promise<UnitBucketRow[]>,
  ]);

  let boxTotal = 0, boxAvailable = 0, boxBlocked = 0, boxTransit = 0;
  let pcTotal = 0, pcAvailable = 0, pcBlocked = 0, pcTransit = 0;
  let bagTotal = 0, bagAvailable = 0, bagBlocked = 0, bagTransit = 0;

  for (const row of unitBuckets) {
    const total = Number(row.total) || 0;
    const available = Number(row.available) || 0;
    const blocked = Number(row.blocked) || 0;
    const transit = Number(row.transit) || 0;

    if (row.bucket === "pc") {
      pcTotal = total; pcAvailable = available; pcBlocked = blocked; pcTransit = transit;
    } else if (row.bucket === "bag") {
      bagTotal = total; bagAvailable = available; bagBlocked = blocked; bagTransit = transit;
    } else {
      boxTotal = total; boxAvailable = available; boxBlocked = blocked; boxTransit = transit;
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
        brandId: true,
        categoryId: true,
        productTypeId: true,
        size: true,
        collection: true,
        finish: true,
        surface: true,
        color: true,
        material: true,
        price: true,
        mrp: true,
        description: true,
        image_key: true,
        thumbnail_key: true,
        lifestyleImage: true,
        textureImage: true,
        images: true,
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
            warehouseId: true,
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
      productCode: p.productCode || null,
      importKey: p.importKey || null,
      productName: p.name,
      brandId: p.brandId || p.brand?.id || null,
      brandName: p.brand?.name || inv?.brand || null,
      categoryId: p.categoryId || p.category?.id || null,
      categoryName: p.category?.name || null,
      productTypeId: p.productTypeId || (p as any).productType?.id || null,
      productTypeName: (p as any).productType?.name || "Tiles",
      productTypeSlug: (p as any).productType?.slug || "tiles",
      productTypeIcon: (p as any).productType?.icon || "Boxes",
      unitName: (p as any).unitRelation?.name || (p as any).unit || "Box",
      unitSymbol: (p as any).unitRelation?.symbol || "Box",
      size: p.size || inv?.size || null,
      collection: p.collection,
      finish: p.finish,
      surface: p.surface,
      color: p.color,
      material: p.material,
      price: p.price ? Number(p.price) : null,
      mrp: p.mrp ? Number(p.mrp) : null,
      description: p.description,
      image_key: p.image_key,
      thumbnail_key: p.thumbnail_key,
      lifestyleImage: p.lifestyleImage,
      textureImage: p.textureImage,
      images: Array.isArray(p.images) ? (p.images as string[]) : [],
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
      warehouseId: inv?.warehouseId || inv?.warehouse?.id || null,
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
      finish: true,
      thumbnail_key: true,
      image_key: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
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
    finish: p.finish,
    brand: p.brand?.name ?? null,
    category: p.category?.name ?? null,
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

export interface CreateStockProductInput {
  name: string;
  sku?: string;
  productCode?: string;
  brandId?: string;
  categoryId?: string;
  productTypeId?: string;
  collectionId?: string;
  size?: string;
  finish?: string;
  surface?: string;
  color?: string;
  material?: string;
  price?: number;
  mrp?: number;
  description?: string;
  images?: string[];
  image_key?: string;
  thumbnail_key?: string;
  lifestyleImage?: string;
  totalStock?: number;
  looseStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  reorderLevel?: number;
  warehouseId?: string;
  remarks?: string;
  performedBy: string;
  performedById?: string;
  role: string;
}

export async function createStockProductItem(input: CreateStockProductInput) {
  if (!input.name || !input.name.trim()) {
    throw new AppError("Product name is required.", 400, "VALIDATION");
  }

  const slugBase = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const uniqueSlug = `${slugBase}-${Date.now().toString(36)}`;

  return await db.$transaction(async (tx) => {
    const imagesList = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
    const heroImage = input.image_key || imagesList[0] || null;
    const thumbImage = input.thumbnail_key || imagesList[0] || null;

    const product = await tx.product.create({
      data: {
        name: input.name.trim(),
        slug: uniqueSlug,
        sku: input.sku?.trim() || undefined,
        productCode: input.productCode?.trim() || undefined,
        brandId: input.brandId || undefined,
        categoryId: input.categoryId || undefined,
        productTypeId: input.productTypeId || undefined,
        collectionId: input.collectionId || undefined,
        size: input.size?.trim() || undefined,
        finish: input.finish?.trim() || undefined,
        surface: input.surface?.trim() || undefined,
        color: input.color?.trim() || undefined,
        material: input.material?.trim() || undefined,
        price: input.price ? input.price : undefined,
        mrp: input.mrp ? input.mrp : undefined,
        description: input.description?.trim() || undefined,
        images: imagesList,
        image_key: heroImage,
        thumbnail_key: thumbImage,
        lifestyleImage: input.lifestyleImage || undefined,
        createdById: input.performedById,
        updatedById: input.performedById,
      },
    });

    const total = Math.max(0, input.totalStock ?? 0);
    const loose = Math.max(0, input.looseStock ?? 0);
    const min = Math.max(0, input.minimumStock ?? 0);
    const max = Math.max(0, input.maximumStock ?? 0);
    const reorder = Math.max(0, input.reorderLevel ?? 0);
    const available = total;
    const status = total <= 0 ? "OUT_OF_STOCK" : (reorder > 0 && available <= reorder) ? "LOW_STOCK" : "AVAILABLE";

    const inventory = await tx.inventory.create({
      data: {
        productId: product.id,
        warehouseId: input.warehouseId || undefined,
        totalStock: total,
        looseStock: loose,
        availableStock: available,
        blockedStock: 0,
        allocatedStock: 0,
        damagedStock: 0,
        transitStock: 0,
        deliveredStock: 0,
        minimumStock: min,
        maximumStock: max,
        reorderLevel: reorder,
        stockStatus: status,
        remarks: input.remarks?.trim() || undefined,
      },
    });

    if (total > 0) {
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          productId: product.id,
          warehouseId: input.warehouseId || undefined,
          movementType: "STOCK_IN",
          quantity: total,
          previousQuantity: 0,
          newQuantity: total,
          referenceType: "ADJUSTMENT",
          reason: input.remarks || "Initial stock record created",
          performedBy: input.performedBy,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "STOCK_PRODUCT_CREATED",
        entity: "Product",
        entityId: product.id,
        userId: input.performedById,
        roleAtTime: input.role,
        newValue: { name: product.name, sku: product.sku, totalStock: total },
        meta: { performedBy: input.performedBy },
      },
    });

    return { product, inventory };
  });
}

export interface UpdateStockProductInput {
  productId: string;
  inventoryId?: string;
  name?: string;
  sku?: string;
  productCode?: string;
  brandId?: string;
  categoryId?: string;
  productTypeId?: string;
  collectionId?: string;
  size?: string;
  finish?: string;
  surface?: string;
  color?: string;
  material?: string;
  price?: number;
  mrp?: number;
  description?: string;
  images?: string[];
  image_key?: string;
  thumbnail_key?: string;
  lifestyleImage?: string;
  totalStock?: number;
  looseStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  reorderLevel?: number;
  warehouseId?: string;
  remarks?: string;
  performedBy: string;
  performedById?: string;
  role: string;
}

export async function updateStockProductItem(input: UpdateStockProductInput) {
  if (!input.productId) throw new AppError("Product ID is required.", 400, "VALIDATION");

  return await db.$transaction(async (tx) => {
    const existingProduct = await tx.product.findUnique({
      where: { id: input.productId },
      include: { inventory: true },
    });
    if (!existingProduct) throw new AppError("Product record not found.", 404, "NOT_FOUND");

    const imagesList = input.images ? input.images.filter(Boolean) : (Array.isArray(existingProduct.images) ? (existingProduct.images as string[]) : []);
    const heroImage = input.image_key ?? imagesList[0] ?? existingProduct.image_key;
    const thumbImage = input.thumbnail_key ?? imagesList[0] ?? existingProduct.thumbnail_key;

    const updatedProduct = await tx.product.update({
      where: { id: input.productId },
      data: {
        name: input.name ? input.name.trim() : existingProduct.name,
        sku: input.sku !== undefined ? (input.sku.trim() || null) : existingProduct.sku,
        productCode: input.productCode !== undefined ? (input.productCode.trim() || null) : existingProduct.productCode,
        brandId: input.brandId !== undefined ? (input.brandId || null) : existingProduct.brandId,
        categoryId: input.categoryId !== undefined ? (input.categoryId || null) : existingProduct.categoryId,
        productTypeId: input.productTypeId !== undefined ? (input.productTypeId || null) : existingProduct.productTypeId,
        collectionId: input.collectionId !== undefined ? (input.collectionId || null) : existingProduct.collectionId,
        size: input.size !== undefined ? (input.size.trim() || null) : existingProduct.size,
        finish: input.finish !== undefined ? (input.finish.trim() || null) : existingProduct.finish,
        surface: input.surface !== undefined ? (input.surface.trim() || null) : existingProduct.surface,
        color: input.color !== undefined ? (input.color.trim() || null) : existingProduct.color,
        material: input.material !== undefined ? (input.material.trim() || null) : existingProduct.material,
        price: input.price !== undefined ? input.price : existingProduct.price,
        mrp: input.mrp !== undefined ? input.mrp : existingProduct.mrp,
        description: input.description !== undefined ? (input.description.trim() || null) : existingProduct.description,
        images: imagesList,
        image_key: heroImage,
        thumbnail_key: thumbImage,
        lifestyleImage: input.lifestyleImage !== undefined ? (input.lifestyleImage || null) : existingProduct.lifestyleImage,
        updatedById: input.performedById,
      },
    });

    let updatedInventory = existingProduct.inventory;
    if (existingProduct.inventory) {
      const prevTotal = existingProduct.inventory.totalStock;
      const newTotal = input.totalStock !== undefined ? Math.max(0, input.totalStock) : prevTotal;
      const loose = input.looseStock !== undefined ? Math.max(0, input.looseStock) : existingProduct.inventory.looseStock;
      const min = input.minimumStock !== undefined ? Math.max(0, input.minimumStock) : existingProduct.inventory.minimumStock;
      const max = input.maximumStock !== undefined ? Math.max(0, input.maximumStock) : existingProduct.inventory.maximumStock;
      const reorder = input.reorderLevel !== undefined ? Math.max(0, input.reorderLevel) : existingProduct.inventory.reorderLevel;

      const blocked = existingProduct.inventory.blockedStock;
      const allocated = existingProduct.inventory.allocatedStock;
      const damaged = existingProduct.inventory.damagedStock;
      const reserved = existingProduct.inventory.reservedStock;
      const available = Math.max(0, newTotal - blocked - allocated - damaged - reserved);

      const status = available <= 0 ? (existingProduct.inventory.transitStock > 0 ? "INCOMING" : newTotal <= 0 ? "OUT_OF_STOCK" : "BLOCKED") : (reorder > 0 && available <= reorder) ? "LOW_STOCK" : "AVAILABLE";

      updatedInventory = await tx.inventory.update({
        where: { id: existingProduct.inventory.id },
        data: {
          totalStock: newTotal,
          looseStock: loose,
          availableStock: available,
          minimumStock: min,
          maximumStock: max,
          reorderLevel: reorder,
          stockStatus: status,
          warehouseId: input.warehouseId !== undefined ? (input.warehouseId || null) : existingProduct.inventory.warehouseId,
          remarks: input.remarks !== undefined ? (input.remarks.trim() || null) : existingProduct.inventory.remarks,
        },
      });

      if (newTotal !== prevTotal) {
        const delta = newTotal - prevTotal;
        await tx.inventoryMovement.create({
          data: {
            inventoryId: existingProduct.inventory.id,
            productId: input.productId,
            warehouseId: input.warehouseId || existingProduct.inventory.warehouseId,
            movementType: "ADJUSTMENT",
            quantity: delta,
            previousQuantity: prevTotal,
            newQuantity: newTotal,
            referenceType: "ADJUSTMENT",
            reason: input.remarks || `Stock level updated from ${prevTotal} to ${newTotal}`,
            performedBy: input.performedBy,
          },
        });
      }
    } else {
      const newTotal = input.totalStock !== undefined ? Math.max(0, input.totalStock) : 0;
      const loose = input.looseStock !== undefined ? Math.max(0, input.looseStock) : 0;
      const min = input.minimumStock !== undefined ? Math.max(0, input.minimumStock) : 0;
      const max = input.maximumStock !== undefined ? Math.max(0, input.maximumStock) : 0;
      const reorder = input.reorderLevel !== undefined ? Math.max(0, input.reorderLevel) : 0;
      const status = newTotal <= 0 ? "OUT_OF_STOCK" : (reorder > 0 && newTotal <= reorder) ? "LOW_STOCK" : "AVAILABLE";

      updatedInventory = await tx.inventory.create({
        data: {
          productId: input.productId,
          brand: input.brandId || null,
          size: input.size || null,
          totalStock: newTotal,
          availableStock: newTotal,
          looseStock: loose,
          minimumStock: min,
          maximumStock: max,
          reorderLevel: reorder,
          stockStatus: status,
          warehouseId: input.warehouseId || null,
          remarks: input.remarks ? input.remarks.trim() : null,
        },
      });

      if (newTotal > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: updatedInventory.id,
            productId: input.productId,
            warehouseId: input.warehouseId || null,
            movementType: "INITIAL_ENTRY",
            quantity: newTotal,
            previousQuantity: 0,
            newQuantity: newTotal,
            referenceType: "ADJUSTMENT",
            reason: input.remarks || "Initial stock level set during edit",
            performedBy: input.performedBy,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        action: "STOCK_PRODUCT_UPDATED",
        entity: "Product",
        entityId: input.productId,
        userId: input.performedById,
        roleAtTime: input.role,
        meta: { performedBy: input.performedBy, details: `Updated stock item ${updatedProduct.name}` },
      },
    });

    return { product: updatedProduct, inventory: updatedInventory };
  });
}

export async function deleteStockProductItem({
  productId,
  inventoryId,
  reason,
  performedBy,
  performedById,
  role,
}: {
  productId: string;
  inventoryId?: string;
  reason?: string;
  performedBy: string;
  performedById?: string;
  role: string;
}) {
  return await db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: {
        inventory: {
          include: {
            stockBlocks: { where: { status: { in: [...ACTIVE_BLOCK_STATUSES] } } },
          },
        },
      },
    });

    if (!product) throw new AppError("Product record not found.", 404, "NOT_FOUND");

    if (product.inventory?.stockBlocks && product.inventory.stockBlocks.length > 0) {
      throw new AppError("Cannot delete stock item with active block holds. Release or deliver holds first.", 400, "ACTIVE_BLOCKS");
    }

    await tx.product.update({
      where: { id: productId },
      data: {
        deletedAt: new Date(),
        deletedById: performedById,
        status: "ARCHIVED",
        published: false,
      },
    });

    if (product.inventory) {
      await tx.inventory.update({
        where: { id: product.inventory.id },
        data: {
          totalStock: 0,
          availableStock: 0,
          stockStatus: "OUT_OF_STOCK",
          remarks: `Deleted by ${performedBy}: ${reason || "No reason given"}`,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: product.inventory.id,
          productId,
          warehouseId: product.inventory.warehouseId,
          movementType: "ADJUSTMENT",
          quantity: -product.inventory.totalStock,
          previousQuantity: product.inventory.totalStock,
          newQuantity: 0,
          referenceType: "ADJUSTMENT",
          reason: `Stock item soft-deleted: ${reason || "Removed from catalogue"}`,
          performedBy,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "STOCK_PRODUCT_DELETED",
        entity: "Product",
        entityId: productId,
        userId: performedById,
        roleAtTime: role,
        meta: { performedBy, reason },
      },
    });

    return { success: true };
  });
}
