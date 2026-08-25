import { db } from "@/lib/db";

export interface CreateProductTypeInput {
  name: string;
  description?: string;
  icon?: string;
  image?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateProductTypeInput {
  name?: string;
  description?: string;
  icon?: string;
  image?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface AttributeDefinitionInput {
  productTypeId: string;
  name: string;
  key: string;
  dataType?: string; // text | number | boolean | select
  unit?: string;
  options?: string[]; // array of select choices
  isRequired?: boolean;
  isFilterable?: boolean;
  sortOrder?: number;
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

export async function getProductTypes(onlyActive = true) {
  return db.productType.findMany({
    where: onlyActive ? { isActive: true } : {},
    include: {
      attributeDefinitions: {
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: { products: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getProductTypeBySlug(slug: string) {
  return db.productType.findUnique({
    where: { slug },
    include: {
      attributeDefinitions: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function createProductType(input: CreateProductTypeInput) {
  const slug = slugify(input.name);
  return db.productType.create({
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      icon: input.icon || "Grid",
      image: input.image || null,
      sortOrder: input.sortOrder || 0,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateProductType(id: string, input: UpdateProductTypeInput) {
  const data: any = {};
  if (input.name) {
    data.name = input.name;
    data.slug = slugify(input.name);
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.image !== undefined) data.image = input.image;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return db.productType.update({
    where: { id },
    data,
  });
}

export async function deleteProductType(id: string) {
  // Prevent deleting product types that have attached products
  const count = await db.product.count({ where: { productTypeId: id } });
  if (count > 0) {
    throw new Error(`Cannot delete Product Type: ${count} product(s) are using this type. Deactivate it instead.`);
  }

  return db.productType.delete({
    where: { id },
  });
}

export async function getUnits() {
  return db.unit.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function upsertAttributeDefinition(input: AttributeDefinitionInput) {
  return db.productAttributeDefinition.upsert({
    where: {
      productTypeId_key: {
        productTypeId: input.productTypeId,
        key: input.key,
      },
    },
    create: {
      productTypeId: input.productTypeId,
      name: input.name,
      key: input.key,
      dataType: input.dataType || "text",
      unit: input.unit || null,
      options: input.options ? (input.options as any) : undefined,
      isRequired: input.isRequired ?? false,
      isFilterable: input.isFilterable ?? true,
      sortOrder: input.sortOrder || 0,
    },
    update: {
      name: input.name,
      dataType: input.dataType || "text",
      unit: input.unit || null,
      options: input.options ? (input.options as any) : undefined,
      isRequired: input.isRequired ?? false,
      isFilterable: input.isFilterable ?? true,
      sortOrder: input.sortOrder || 0,
    },
  });
}

export async function deleteAttributeDefinition(id: string) {
  return db.productAttributeDefinition.delete({
    where: { id },
  });
}

export async function getProductCategoryBreakdown() {
  const types = await db.productType.findMany({
    where: { isActive: true },
    include: {
      products: {
        select: {
          id: true,
          inventory: {
            select: { availableStock: true, totalStock: true },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const totalProducts = await db.product.count({ where: { deletedAt: null } });

  const breakdown = types.map((pt) => {
    let availableStock = 0;
    let totalStock = 0;

    for (const p of pt.products) {
      if (p.inventory) {
        availableStock += p.inventory.availableStock;
        totalStock += p.inventory.totalStock;
      }
    }

    return {
      id: pt.id,
      name: pt.name,
      slug: pt.slug,
      icon: pt.icon || "Grid",
      productCount: pt.products.length,
      availableStock,
      totalStock,
    };
  });

  return {
    totalProducts,
    breakdown,
  };
}
