import { db } from "@/lib/db";
import { assertPermission, canManageProducts, conflict, notFound, type Role } from "@/lib/permissions";
import { invalidateCache } from "@/lib/redis";

export interface ProductListFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  collectionId?: string;
  productTypeId?: string;
  status?: string; // ACTIVE | DRAFT | ARCHIVED
  published?: boolean;
  /** Include soft-deleted rows — used by the "show archived/deleted" toggle. */
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface ProductInput {
  name: string;
  sku?: string | null;
  productCode?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  collectionId?: string | null;
  productTypeId?: string | null;
  unitId?: string | null;
  size?: string | null;
  thickness?: string | null;
  finish?: string | null;
  surface?: string | null;
  color?: string | null;
  material?: string | null;
  texture?: string | null;
  image_key?: string | null;
  thumbnail_key?: string | null;
  lifestyleImage?: string | null;
  textureImage?: string | null;
  images?: string[] | null;
  video?: string | null;
  brochureUrl?: string | null;
  price?: number | null;
  mrp?: number | null;
  weight?: string | null;
  coverage?: string | null;
  packing?: string | null;
  tag?: string | null;
  featured?: boolean;
  designerPick?: boolean;
  newArrival?: boolean;
  published?: boolean;
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
}

interface Actor {
  userId: string;
  role: Role;
  name?: string;
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/** Appends -2, -3, … until the slug is free. Product names legitimately repeat across sizes/finishes. */
async function uniqueSlug(name: string, size: string | null | undefined, excludeId?: string): Promise<string> {
  const base = slugify(size ? `${name} ${size}` : name) || "product";
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await db.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

async function assertSkuAvailable(sku: string | null | undefined, excludeId?: string) {
  if (!sku) return;
  const existing = await db.product.findFirst({
    where: { sku, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true },
  });
  if (existing) {
    throw conflict(`SKU "${sku}" is already used by "${existing.name}".`);
  }
}

async function invalidateProductCaches() {
  await Promise.all([invalidateCache("products:*"), invalidateCache("search:*"), invalidateCache("dashboard:*")]);
}

function searchClause(search?: string): any {
  const q = (search || "").trim();
  if (!q) return {};

  const like = (t: string) => ({ contains: t, mode: "insensitive" as const });
  return {
    OR: [
      { name: like(q) },
      { sku: like(q) },
      { productCode: like(q) },
      { size: like(q) },
      { finish: like(q) },
      { surface: like(q) },
      { color: like(q) },
      { brand: { is: { name: like(q) } } },
      { category: { is: { name: like(q) } } },
      { collectionRelation: { is: { name: like(q) } } },
    ],
  };
}

const PRODUCT_LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  sku: true,
  productCode: true,
  size: true,
  finish: true,
  surface: true,
  color: true,
  status: true,
  published: true,
  image_key: true,
  thumbnail_key: true,
  lifestyleImage: true,
  createdAt: true,
  updatedAt: true,
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  collectionRelation: { select: { id: true, name: true } },
  inventory: { select: { totalStock: true, availableStock: true, stockStatus: true } },
} as const;

export async function getProducts(filters: ProductListFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(Math.max(filters.limit || 24, 1), 100);
  const skip = (page - 1) * limit;

  const where: any = {
    deletedAt: filters.includeDeleted ? undefined : null,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.brandId ? { brandId: filters.brandId } : {}),
    ...(filters.collectionId ? { collectionId: filters.collectionId } : {}),
    ...(filters.productTypeId ? { productTypeId: filters.productTypeId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.published !== undefined ? { published: filters.published } : {}),
    ...searchClause(filters.search),
  };

  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      select: PRODUCT_LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    db.product.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

export async function getProductById(id: string, options: { includeDeleted?: boolean } = {}) {
  const product = await db.product.findFirst({
    where: { id, ...(options.includeDeleted ? {} : { deletedAt: null }) },
    include: {
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      collectionRelation: { select: { id: true, name: true } },
      productType: { select: { id: true, name: true } },
      unitRelation: { select: { id: true, name: true, symbol: true } },
      inventory: {
        select: { totalStock: true, availableStock: true, blockedStock: true, transitStock: true },
      },
    },
  });

  if (!product) throw notFound("Product not found.");
  return product;
}

/** Reference lists for the product form's dropdowns. */
export async function getProductFormOptions() {
  const [brands, categories, collections, productTypes, units] = await Promise.all([
    db.brand.findMany({ where: { published: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { published: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.collection.findMany({ where: { published: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.productType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.unit.findMany({ where: { isActive: true }, select: { id: true, name: true, symbol: true }, orderBy: { name: "asc" } }),
  ]);
  return { brands, categories, collections, productTypes, units };
}

function toWriteData(input: ProductInput) {
  return {
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    productCode: input.productCode?.trim() || null,
    description: input.description?.trim() || null,
    shortDescription: input.shortDescription?.trim() || null,
    brandId: input.brandId || null,
    categoryId: input.categoryId || null,
    collectionId: input.collectionId || null,
    productTypeId: input.productTypeId || null,
    unitId: input.unitId || null,
    size: input.size?.trim() || null,
    thickness: input.thickness?.trim() || null,
    finish: input.finish?.trim() || null,
    surface: input.surface?.trim() || null,
    color: input.color?.trim() || null,
    material: input.material?.trim() || null,
    texture: input.texture?.trim() || null,
    image_key: input.image_key?.trim() || null,
    thumbnail_key: input.thumbnail_key?.trim() || null,
    lifestyleImage: input.lifestyleImage?.trim() || null,
    textureImage: input.textureImage?.trim() || null,
    images: input.images && input.images.length > 0 ? input.images : undefined,
    video: input.video?.trim() || null,
    brochureUrl: input.brochureUrl?.trim() || null,
    price: input.price ?? null,
    mrp: input.mrp ?? null,
    weight: input.weight?.trim() || null,
    coverage: input.coverage?.trim() || null,
    packing: input.packing?.trim() || null,
    tag: input.tag?.trim() || null,
    featured: input.featured ?? false,
    designerPick: input.designerPick ?? false,
    newArrival: input.newArrival ?? false,
    published: input.published ?? true,
    status: input.status || "ACTIVE",
  };
}

export async function createProduct(input: ProductInput, actor: Actor) {
  assertPermission(canManageProducts(actor.role), "Only Super Admin can create products.");

  if (!input.name || !input.name.trim()) {
    throw conflict("Product name is required.");
  }

  await assertSkuAvailable(input.sku);
  const slug = await uniqueSlug(input.name, input.size);
  const data = toWriteData(input);

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: { ...data, slug, createdById: actor.userId, updatedById: actor.userId },
    });

    // Every product needs a matching zero-stock Inventory row so it shows up
    // in Inventory Control immediately — stock is entered afterward through
    // the existing stock-adjustment workflow, never invented here.
    await tx.inventory.create({ data: { productId: created.id } });

    await tx.auditLog.create({
      data: {
        action: "PRODUCT_CREATED",
        entity: "Product",
        entityId: created.id,
        userId: actor.userId,
        roleAtTime: actor.role,
        newValue: { name: created.name, sku: created.sku, slug: created.slug },
        meta: { performedBy: actor.name || actor.userId },
      },
    });

    return created;
  });

  await invalidateProductCaches();
  return product;
}

export async function updateProduct(id: string, input: ProductInput, actor: Actor) {
  assertPermission(canManageProducts(actor.role), "Only Super Admin can edit products.");

  const existing = await db.product.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound("Product not found.");

  if (!input.name || !input.name.trim()) {
    throw conflict("Product name is required.");
  }

  await assertSkuAvailable(input.sku, id);
  const data = toWriteData(input);
  const slugChanged = existing.name !== input.name.trim() || existing.size !== (input.size?.trim() || null);
  const slug = slugChanged ? await uniqueSlug(input.name, input.size, id) : existing.slug;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.product.update({
      where: { id },
      data: { ...data, slug, updatedById: actor.userId },
    });

    await tx.auditLog.create({
      data: {
        action: "PRODUCT_UPDATED",
        entity: "Product",
        entityId: id,
        userId: actor.userId,
        roleAtTime: actor.role,
        oldValue: { name: existing.name, sku: existing.sku, status: existing.status, published: existing.published },
        newValue: { name: result.name, sku: result.sku, status: result.status, published: result.published },
        meta: { performedBy: actor.name || actor.userId },
      },
    });

    return result;
  });

  await invalidateProductCaches();
  return updated;
}

async function setProductStatus(id: string, actor: Actor, target: { status: string; published: boolean }, action: string) {
  assertPermission(canManageProducts(actor.role), "Only Super Admin can change product status.");

  const existing = await db.product.findFirst({ where: { id, deletedAt: null }, select: { status: true, published: true } });
  if (!existing) throw notFound("Product not found.");

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.product.update({ where: { id }, data: { ...target, updatedById: actor.userId } });
    await tx.auditLog.create({
      data: {
        action,
        entity: "Product",
        entityId: id,
        userId: actor.userId,
        roleAtTime: actor.role,
        oldValue: { status: existing.status, published: existing.published },
        newValue: { status: target.status, published: target.published },
        meta: { performedBy: actor.name || actor.userId },
      },
    });
    return result;
  });

  await invalidateProductCaches();
  return updated;
}

/** Archives a product without touching history — spec: never hard-delete a referenced product. */
export async function deactivateProduct(id: string, actor: Actor) {
  return setProductStatus(id, actor, { status: "ARCHIVED", published: false }, "PRODUCT_DEACTIVATED");
}

export async function reactivateProduct(id: string, actor: Actor) {
  return setProductStatus(id, actor, { status: "ACTIVE", published: true }, "PRODUCT_REACTIVATED");
}

/**
 * Soft-deletes a product (sets deletedAt) after confirming nothing depends on
 * it. Never a hard `.delete()` — history must survive even when a product is
 * removed from every list.
 */
export async function softDeleteProduct(id: string, actor: Actor) {
  assertPermission(canManageProducts(actor.role), "Only Super Admin can delete products.");

  const existing = await db.product.findFirst({
    where: { id, deletedAt: null },
    select: {
      name: true,
      inventory: { select: { totalStock: true, blockedStock: true, transitStock: true } },
      _count: { select: { inventoryHistory: true, stockBookingItems: true } },
    },
  });
  if (!existing) throw notFound("Product not found.");

  const inv = existing.inventory;
  const hasStock = !!inv && (inv.totalStock > 0 || inv.blockedStock > 0 || inv.transitStock > 0);
  const hasHistory = existing._count.inventoryHistory > 0 || existing._count.stockBookingItems > 0;

  if (hasStock || hasHistory) {
    throw conflict(
      `"${existing.name}" has stock or transaction history and cannot be deleted — deactivate it instead.`
    );
  }

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.userId, published: false, status: "ARCHIVED" },
    });
    await tx.auditLog.create({
      data: {
        action: "PRODUCT_DELETED",
        entity: "Product",
        entityId: id,
        userId: actor.userId,
        roleAtTime: actor.role,
        oldValue: { name: existing.name },
        meta: { performedBy: actor.name || actor.userId },
      },
    });
  });

  await invalidateProductCaches();
}

export type QuickCreateKind = "brand" | "category" | "collection";

/** Lightweight inline "+ create new" from the product form's dropdowns. */
export async function quickCreateTaxonomy(kind: QuickCreateKind, name: string, actor: Actor) {
  assertPermission(canManageProducts(actor.role), "Only Super Admin can create brands/categories/collections.");

  const trimmed = name.trim();
  if (!trimmed) throw conflict("Name is required.");
  const slug = slugify(trimmed);

  if (kind === "brand") {
    return db.brand.create({ data: { name: trimmed, slug } });
  }
  if (kind === "category") {
    return db.category.create({ data: { name: trimmed, slug } });
  }
  return db.collection.create({ data: { name: trimmed, slug } });
}
