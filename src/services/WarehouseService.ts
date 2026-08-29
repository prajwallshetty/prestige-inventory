import { db } from "@/lib/db";
import { invalidateCache } from "@/lib/redis";
import { Prisma } from "@prisma/client";

const WAREHOUSE_TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

export async function listWarehouses() {
  return db.warehouse.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { inventories: true, stockBlocks: true, shipments: true, users: true } },
    },
  });
}

export async function createWarehouse({
  name,
  code,
  location,
  address,
  status = "ACTIVE",
  createdById,
  createdByName,
}: {
  name: string;
  code: string;
  location?: string | null;
  address?: string | null;
  status?: string;
  createdById?: string | null;
  createdByName?: string;
}) {
  if (!name?.trim()) throw new Error("Warehouse name is required.");
  if (!code?.trim()) throw new Error("Warehouse code is required.");

  const normalisedCode = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{2,10}$/.test(normalisedCode)) {
    throw new Error("Warehouse code must be 2-10 alphanumeric characters (no spaces).");
  }

  const warehouse = await db.$transaction(async (tx) => {
    const clash = await tx.warehouse.findUnique({ where: { code: normalisedCode } });
    if (clash) {
      throw new Error(`A warehouse with code '${normalisedCode}' already exists.`);
    }

    const created = await tx.warehouse.create({
      data: {
        name: name.trim(),
        code: normalisedCode,
        location: location?.trim() || null,
        address: address?.trim() || null,
        status,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE_WAREHOUSE",
        entity: "Warehouse",
        entityId: created.id,
        userId: createdById || null,
        newValue: { name: created.name, code: created.code, status },
        meta: { performedBy: createdByName || "Super Admin" },
      },
    });

    return created;
  }, WAREHOUSE_TX_OPTIONS);

  await invalidateCache("warehouses:*");
  return warehouse;
}

export async function updateWarehouse({
  id,
  name,
  location,
  address,
  status,
  updatedById,
  updatedByName,
}: {
  id: string;
  name?: string;
  location?: string | null;
  address?: string | null;
  status?: string;
  updatedById?: string | null;
  updatedByName?: string;
}) {
  const existing = await db.warehouse.findUnique({ where: { id } });
  if (!existing) throw new Error("Warehouse not found.");

  const updated = await db.warehouse.update({
    where: { id },
    data: {
      // Code is immutable as it is referenced in inventory records
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(location !== undefined ? { location: location?.trim() || null } : {}),
      ...(address !== undefined ? { address: address?.trim() || null } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE_WAREHOUSE",
      entity: "Warehouse",
      entityId: id,
      userId: updatedById || null,
      oldValue: { name: existing.name, status: existing.status },
      newValue: { name: updated.name, status: updated.status },
      meta: { performedBy: updatedByName || "Super Admin" },
    },
  });

  await invalidateCache("warehouses:*");
  return updated;
}

export async function deleteWarehouse({
  id,
  performedById,
  performedByName,
}: {
  id: string;
  performedById?: string | null;
  performedByName?: string;
}) {
  const existing = await db.warehouse.findUnique({ where: { id } });
  if (!existing) throw new Error("Warehouse not found.");

  // Check dependencies before deleting
  const [inventoriesCount, stockBlocksCount, shipmentsCount, usersCount] = await Promise.all([
    db.inventory.count({ where: { warehouseId: id } }),
    db.stockBlock.count({
      where: {
        warehouseId: id,
        status: { notIn: ["CANCELLED", "RELEASED", "DELIVERED", "REJECTED", "EXPIRED"] },
      },
    }),
    db.shipment.count({
      where: {
        warehouseId: id,
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    }),
    db.user.count({ where: { warehouse_id: id } }),
  ]);

  if (inventoriesCount > 0) {
    throw new Error(`Cannot delete warehouse: manages ${inventoriesCount} product inventory records.`);
  }
  if (stockBlocksCount > 0) {
    throw new Error(`Cannot delete warehouse: holds ${stockBlocksCount} active/pending stock blocks.`);
  }
  if (shipmentsCount > 0) {
    throw new Error(`Cannot delete warehouse: has ${shipmentsCount} active incoming shipments.`);
  }
  if (usersCount > 0) {
    throw new Error(`Cannot delete warehouse: assigned to ${usersCount} users.`);
  }

  const deleted = await db.warehouse.delete({ where: { id } });

  await db.auditLog.create({
    data: {
      action: "DELETE_WAREHOUSE",
      entity: "Warehouse",
      entityId: id,
      userId: performedById || null,
      oldValue: { name: existing.name, code: existing.code },
      newValue: Prisma.DbNull,
      meta: { performedBy: performedByName || "Super Admin" },
    },
  });

  await invalidateCache("warehouses:*");
  return deleted;
}
