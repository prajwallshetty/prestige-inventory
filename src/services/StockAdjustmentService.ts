import { db } from "@/lib/db";

export async function adjustStock({
  productId,
  adjustmentQuantity,
  reason,
  performedBy,
}: {
  productId: string;
  adjustmentQuantity: number;
  reason: string;
  performedBy: string;
}) {
  return await db.$transaction(async (tx) => {
    // 1. Find or create inventory record
    let inventory = await tx.inventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      const warehouse = await tx.warehouse.findFirst();
      inventory = await tx.inventory.create({
        data: {
          productId,
          warehouseId: warehouse?.id,
          availableStock: 0,
          totalStock: 0,
        },
      });
    }

    const previousQuantity = inventory.availableStock;
    const newQuantity = previousQuantity + adjustmentQuantity;

    if (newQuantity < 0) {
      throw new Error(`Adjustment of ${adjustmentQuantity} would result in negative available stock (${newQuantity}).`);
    }

    // Determine status
    let newStatus = "AVAILABLE";
    if (newQuantity <= 0) {
      newStatus = inventory.transitStock > 0 ? "INCOMING" : "OUT_OF_STOCK";
    } else if (inventory.reorderLevel > 0 && newQuantity <= inventory.reorderLevel) {
      newStatus = "LOW_STOCK";
    }

    // 2. Update inventory
    const updatedInventory = await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        availableStock: newQuantity,
        totalStock: newQuantity + inventory.blockedStock + inventory.allocatedStock + inventory.damagedStock,
        stockStatus: newStatus,
      },
    });

    // 3. Create Stock Movement Audit Record
    const movement = await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId,
        warehouseId: inventory.warehouseId,
        movementType: "ADJUSTMENT",
        quantity: adjustmentQuantity,
        previousQuantity,
        newQuantity,
        referenceType: "ADJUSTMENT",
        reason: reason || "Manual Inventory Adjustment",
        performedBy: performedBy || "Inventory Admin",
      },
    });

    return { updatedInventory, movement };
  });
}
