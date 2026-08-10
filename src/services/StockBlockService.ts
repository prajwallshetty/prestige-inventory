import { db } from "@/lib/db";

export async function createBlockRequest({
  productId,
  quantity,
  dealerId,
  remarks,
  durationHours = 48,
  requestedBy,
}: {
  productId: string;
  quantity: number;
  dealerId?: string;
  remarks?: string;
  durationHours?: number;
  requestedBy: string;
}) {
  return await db.$transaction(async (tx) => {
    // Lock inventory record for transaction concurrency safety
    const inventory = await tx.inventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      throw new Error("Inventory record not found for this product.");
    }

    if (inventory.availableStock < quantity) {
      throw new Error(`Insufficient available stock (${inventory.availableStock} available, requested ${quantity}).`);
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    const block = await tx.stockBlock.create({
      data: {
        productId,
        inventoryId: inventory.id,
        warehouseId: inventory.warehouseId,
        dealerId: dealerId || null,
        quantity,
        requestedBy,
        status: "PENDING",
        remarks,
        expiresAt,
      },
    });

    return block;
  });
}

export async function approveBlock({
  blockId,
  approvedBy,
}: {
  blockId: string;
  approvedBy: string;
}) {
  return await db.$transaction(async (tx) => {
    const block = await tx.stockBlock.findUnique({
      where: { id: blockId },
      include: { inventory: true },
    });

    if (!block) throw new Error("Stock block request not found.");
    if (block.status !== "PENDING") throw new Error(`Block request is not in PENDING state (Current: ${block.status}).`);

    const inventory = block.inventory;
    if (inventory.availableStock < block.quantity) {
      // Auto-reject if available stock dropped concurrently
      await tx.stockBlock.update({
        where: { id: blockId },
        data: { status: "REJECTED", remarks: "Auto-rejected due to insufficient available stock." },
      });
      throw new Error(`Insufficient available stock (${inventory.availableStock} available, requested ${block.quantity}). Block rejected.`);
    }

    const prevAvailable = inventory.availableStock;
    const newAvailable = prevAvailable - block.quantity;
    const prevBlocked = inventory.blockedStock;
    const newBlocked = prevBlocked + block.quantity;

    // Update inventory stock balances
    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        availableStock: newAvailable,
        blockedStock: newBlocked,
        stockStatus: newAvailable <= 0 ? "BLOCKED" : inventory.stockStatus,
      },
    });

    // Update block status
    const updatedBlock = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "APPROVED",
        approvedBy,
        approvedAt: new Date(),
      },
    });

    // Record Stock Movement
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: block.productId,
        warehouseId: block.warehouseId,
        movementType: "BLOCKED",
        quantity: block.quantity,
        previousQuantity: prevAvailable,
        newQuantity: newAvailable,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: block.remarks || "Stock Block Approved",
        performedBy: approvedBy,
      },
    });

    return updatedBlock;
  });
}

export async function releaseBlock({
  blockId,
  releasedBy,
  reason,
}: {
  blockId: string;
  releasedBy: string;
  reason?: string;
}) {
  return await db.$transaction(async (tx) => {
    const block = await tx.stockBlock.findUnique({
      where: { id: blockId },
      include: { inventory: true },
    });

    if (!block) throw new Error("Stock block not found.");
    if (block.status !== "APPROVED" && block.status !== "EXPIRED") {
      throw new Error(`Only APPROVED or EXPIRED blocks can be released (Current status: ${block.status}).`);
    }

    const inventory = block.inventory;
    const prevAvailable = inventory.availableStock;
    const newAvailable = prevAvailable + block.quantity;
    const prevBlocked = inventory.blockedStock;
    const newBlocked = Math.max(0, prevBlocked - block.quantity);

    // Update inventory
    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        availableStock: newAvailable,
        blockedStock: newBlocked,
        stockStatus: newAvailable > 0 ? "AVAILABLE" : inventory.stockStatus,
      },
    });

    // Update block status
    const updatedBlock = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        remarks: reason ? `${block.remarks || ""} [Release reason: ${reason}]` : block.remarks,
      },
    });

    // Movement Log
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: block.productId,
        warehouseId: block.warehouseId,
        movementType: "BLOCK_RELEASED",
        quantity: block.quantity,
        previousQuantity: prevAvailable,
        newQuantity: newAvailable,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: reason || "Block Released",
        performedBy: releasedBy,
      },
    });

    return updatedBlock;
  });
}

export async function releaseExpiredBlocks() {
  const now = new Date();
  const expiredBlocks = await db.stockBlock.findMany({
    where: {
      status: "APPROVED",
      expiresAt: { lte: now },
    },
  });

  console.log(`[EXPIRATION WORKER] Found ${expiredBlocks.length} expired stock blocks.`);

  let releasedCount = 0;
  for (const block of expiredBlocks) {
    try {
      await releaseBlock({
        blockId: block.id,
        releasedBy: "SYSTEM_AUTO_EXPIRY",
        reason: "Automatic release of expired stock reservation",
      });
      await db.stockBlock.update({
        where: { id: block.id },
        data: { status: "EXPIRED" },
      });
      releasedCount++;
    } catch (err) {
      console.error(`[EXPIRATION WORKER] Failed releasing block ${block.id}:`, err);
    }
  }

  return { found: expiredBlocks.length, released: releasedCount };
}
