import { db } from "@/lib/db";
import { AppError } from "@/lib/permissions";
import { invalidateCache } from "@/lib/redis";

/**
 * Manual correction of physical stock.
 *
 * Two things were wrong before: the inventory row was never locked (so an
 * adjustment racing a block creation could lose one of the two updates), and
 * the maths ran backwards — it set `availableStock` and then *derived*
 * `totalStock` from it, which lets an adjustment silently invent or destroy
 * physical stock that is currently blocked. Physical stock is the authoritative
 * figure; available is always derived from it.
 */
export async function adjustStock({
  productId,
  adjustmentQuantity,
  reason,
  performedBy,
  performedById,
  role,
}: {
  productId: string;
  adjustmentQuantity: number;
  reason: string;
  performedBy: string;
  performedById?: string | null;
  role?: string | null;
}) {
  const result = await db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          totalStock: number;
          blockedStock: number;
          allocatedStock: number;
          damagedStock: number;
          transitStock: number;
          reorderLevel: number;
          warehouseId: string | null;
        }>
      >`SELECT id, "totalStock", "blockedStock", "allocatedStock", "damagedStock",
               "transitStock", "reorderLevel", "warehouseId"
          FROM "Inventory"
         WHERE "productId" = ${productId}
         FOR UPDATE`;

      let inventory = rows[0];

      if (!inventory) {
        const warehouse = await tx.warehouse.findFirst({ select: { id: true } });
        const created = await tx.inventory.create({
          data: { productId, warehouseId: warehouse?.id, availableStock: 0, totalStock: 0 },
        });
        inventory = {
          id: created.id,
          totalStock: created.totalStock,
          blockedStock: created.blockedStock,
          allocatedStock: created.allocatedStock,
          damagedStock: created.damagedStock,
          transitStock: created.transitStock,
          reorderLevel: created.reorderLevel,
          warehouseId: created.warehouseId,
        };
      }

      const previousTotal = inventory.totalStock;
      const newTotal = previousTotal + adjustmentQuantity;

      if (newTotal < 0) {
        throw new AppError(
          `That adjustment would take physical stock below zero (${previousTotal} → ${newTotal}).`,
          400,
          "NEGATIVE_STOCK"
        );
      }

      const committed = inventory.blockedStock + inventory.allocatedStock + inventory.damagedStock;
      if (newTotal < committed) {
        throw new AppError(
          `Cannot reduce physical stock to ${newTotal}: ${committed} boxes are already blocked, allocated or damaged.`,
          409,
          "COMMITTED_STOCK"
        );
      }

      const newAvailable = Math.max(0, newTotal - committed);
      const newStatus =
        newAvailable <= 0
          ? inventory.transitStock > 0
            ? "INCOMING"
            : newTotal <= 0
              ? "OUT_OF_STOCK"
              : "BLOCKED"
          : inventory.reorderLevel > 0 && newAvailable <= inventory.reorderLevel
            ? "LOW_STOCK"
            : "AVAILABLE";

      const updatedInventory = await tx.inventory.update({
        where: { id: inventory.id },
        data: { totalStock: newTotal, availableStock: newAvailable, stockStatus: newStatus },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          productId,
          warehouseId: inventory.warehouseId,
          movementType: "ADJUSTMENT",
          quantity: adjustmentQuantity,
          previousQuantity: previousTotal,
          newQuantity: newTotal,
          referenceType: "ADJUSTMENT",
          reason,
          performedBy,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "STOCK_ADJUSTMENT",
          entity: "Inventory",
          entityId: inventory.id,
          userId: performedById || null,
          roleAtTime: role || null,
          oldValue: { totalStock: previousTotal },
          newValue: { totalStock: newTotal },
          meta: { performedBy, reason, productId, adjustmentQuantity },
        },
      });

      return { updatedInventory, movement };
    },
    { timeout: 30_000, maxWait: 20_000 }
  );

  await Promise.all([invalidateCache("inventory:*"), invalidateCache("dashboard:*")]);
  return result;
}
