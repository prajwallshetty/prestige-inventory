import { db } from "@/lib/db";
import { sendNotificationsToUsers } from "@/services/NotificationService";
import { invalidateCache } from "@/lib/redis";
import {
  type Role,
  type BlockStatus,
  ACTIVE_BLOCK_STATUSES,
  assertPermission,
  canApproveBlock,
  canCancelBlock,
  canDeliverBlock,
  canMarkReadyToShip,
  canRejectBlock,
  canReleaseBlock,
  canShipBlock,
  canTransition,
} from "@/lib/permissions";

/**
 * Transaction settings for stock mutations.
 *
 * Prisma's 5s default is too tight here: the database is in another region
 * (~1.5s per round trip from the operating location), and a block mutation
 * legitimately needs 5-6 statements while holding a row lock. `maxWait` gives
 * the *second* concurrent caller room to sit on the lock rather than failing
 * spuriously — losing a race should mean "insufficient stock", not a timeout.
 *
 * These numbers can drop sharply once the database is moved closer.
 */
const STOCK_TX_OPTIONS = { timeout: 30_000, maxWait: 20_000 } as const;

/**
 * Locks a product's inventory row for the remainder of the transaction.
 *
 * `SELECT … FOR UPDATE` is the whole point: a plain findUnique lets two
 * concurrent transactions both read the same availability, both pass the
 * check, and both write — which double-reserves stock and loses one update.
 * Every path that changes reserved quantities must go through this first.
 */
async function lockInventoryByProduct(tx: any, productId: string) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      totalStock: number;
      availableStock: number;
      blockedStock: number;
      allocatedStock: number;
      damagedStock: number;
      deliveredStock: number;
      transitStock: number;
      reorderLevel: number;
      stockStatus: string;
      warehouseId: string | null;
    }>
  >`SELECT id, "totalStock", "availableStock", "blockedStock", "allocatedStock",
           "damagedStock", "deliveredStock", "transitStock", "reorderLevel",
           "stockStatus", "warehouseId"
      FROM "Inventory"
     WHERE "productId" = ${productId}
     FOR UPDATE`;
  return rows[0] ?? null;
}

/** Same lock, addressed by inventory id (used by approve/ship/cancel paths). */
async function lockInventoryById(tx: any, inventoryId: string) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      totalStock: number;
      availableStock: number;
      blockedStock: number;
      allocatedStock: number;
      damagedStock: number;
      deliveredStock: number;
      transitStock: number;
      reorderLevel: number;
      stockStatus: string;
      warehouseId: string | null;
    }>
  >`SELECT id, "totalStock", "availableStock", "blockedStock", "allocatedStock",
           "damagedStock", "deliveredStock", "transitStock", "reorderLevel",
           "stockStatus", "warehouseId"
      FROM "Inventory"
     WHERE id = ${inventoryId}
     FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Allocates the next human-readable block number, e.g. BLK-2026-000001.
 *
 * Runs inside the caller's transaction and relies on an atomic upsert+increment,
 * so two concurrent creations can never receive the same number. Replaces the
 * previous random suffix, which was neither sequential nor collision-proof.
 */
async function nextBlockNumber(tx: any): Promise<string> {
  const year = new Date().getFullYear();
  const row = await tx.blockNumberSequence.upsert({
    where: { year },
    update: { lastValue: { increment: 1 } },
    create: { year, lastValue: 1 },
  });
  return `BLK-${year}-${String(row.lastValue).padStart(6, "0")}`;
}

/**
 * Records a status change on the shared AuditLog (rather than a parallel
 * history table — AuditLog already has an indexed (entity, entityId) lookup
 * and Json old/new columns, which is exactly what the timeline needs).
 */
async function recordBlockAudit(
  tx: any,
  {
    action,
    blockId,
    userId,
    userName,
    role,
    fromStatus,
    toStatus,
    reason,
    meta,
  }: {
    action: string;
    blockId: string;
    userId?: string | null;
    userName: string;
    role?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    reason?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  await tx.auditLog.create({
    data: {
      action,
      entity: "StockBlock",
      entityId: blockId,
      userId: userId || null,
      roleAtTime: role || null,
      oldValue: fromStatus ? { status: fromStatus } : undefined,
      newValue: toStatus ? { status: toStatus } : undefined,
      meta: { performedBy: userName, reason: reason ?? null, ...(meta || {}) },
    },
  });
}

/**
 * Guards a status change. Throws unless the transition is in the state machine,
 * so no caller — including the frontend — can force an arbitrary status.
 */
function assertTransition(from: string, to: BlockStatus) {
  if (!canTransition(from as BlockStatus, to)) {
    const err = new Error(`Illegal status transition: ${from} → ${to}.`);
    (err as any).statusCode = 409;
    throw err;
  }
}

export async function createBlockRequest({
  productId,
  quantity,
  dealerId,
  showroomId,
  remarks,
  durationHours = 48,
  requestedBy,
  createdById,
  blocked_by,
  blockType = "BLOCKED",
  userRole,
}: {
  productId: string;
  quantity: number;
  dealerId?: string;
  showroomId?: string;
  remarks?: string;
  durationHours?: number;
  requestedBy: string;
  createdById?: string | null;
  blocked_by?: "SAMSHUDIN" | "SALMAN";
  blockType?: "BLOCKED" | "CONFIRMED";
  userRole?: string;
}) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Block quantity must be greater than zero.");
  }

  const result = await db.$transaction(async (tx) => {
    // Serialise on the inventory row. Everything below reads post-lock values,
    // so a concurrent transaction cannot reserve the same stock.
    const inventory = await lockInventoryByProduct(tx, productId);
    if (!inventory) {
      throw new Error("Inventory record not found for this product.");
    }

    // AVAILABLE = PHYSICAL − BLOCKED − ALLOCATED − DAMAGED
    const calculatedAvailable =
      inventory.totalStock - inventory.blockedStock - inventory.allocatedStock - inventory.damagedStock;

    if (calculatedAvailable < quantity) {
      throw new Error(
        `Insufficient available stock (Only ${calculatedAvailable} boxes are currently available, requested ${quantity}).`
      );
    }

    // Approval route is derived from the creator's role, never from the
    // client: staff blocks must clear the In-Charge first, everyone else
    // goes straight to the Manager queue.
    const isStaff = userRole === "SHOWROOM_STAFF";
    const status: BlockStatus = isStaff ? "PENDING_INCHARGE_APPROVAL" : "PENDING_MANAGER_APPROVAL";
    const approvalRoute = isStaff ? "INCHARGE" : "DIRECT";

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    const block = await tx.stockBlock.create({
      data: {
        block_number: await nextBlockNumber(tx),
        block_type: blockType,
        productId,
        inventoryId: inventory.id,
        warehouseId: inventory.warehouseId,
        dealerId: dealerId || null,
        showroomId: showroomId || null,
        quantity,
        requestedBy,
        createdById: createdById || null,
        createdRole: userRole || null,
        blocked_by: blocked_by || null,
        status,
        remarks,
        approvalRoute,
        expiresAt,
      },
    });

    // Reserving stock never touches physical stock — only the split between
    // available and blocked.
    const newAvailable = calculatedAvailable - quantity;
    const newBlocked = inventory.blockedStock + quantity;

    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        availableStock: newAvailable,
        blockedStock: newBlocked,
        stockStatus: newAvailable <= 0 ? "BLOCKED" : inventory.stockStatus,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId,
        warehouseId: inventory.warehouseId,
        movementType: "BLOCK_CREATED",
        quantity,
        previousQuantity: inventory.availableStock,
        newQuantity: newAvailable,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: remarks || "Stock block requested",
        performedBy: requestedBy,
      },
    });

    await recordBlockAudit(tx, {
      action: "CREATE_BLOCK",
      blockId: block.id,
      userId: createdById,
      userName: requestedBy,
      role: userRole,
      toStatus: status,
      reason: remarks,
      meta: { blockNumber: block.block_number, quantity },
    });

    return block;
  }, STOCK_TX_OPTIONS);

  // Post-transaction Cache & Notifications
  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");

  if (result.status === "PENDING_INCHARGE_APPROVAL") {
    // §10 — staff block goes to the In-Charge ONLY. The Manager is deliberately
    // not told yet; they have nothing to act on until the In-Charge signs off.
    await notifyBlockParties(result, {
      type: "BLOCK_CREATED",
      title: "Block Awaiting Your Approval",
      message: `New block ${result.block_number} is waiting for your approval.`,
      audiences: ["SHOWROOM_INCHARGE"],
    });
  } else {
    // §12 — an In-Charge (or Manager/Admin) raised it, so it enters the final
    // approval queue immediately. No self-approval notification for the creator.
    await notifyBlockParties(result, {
      type: "BLOCK_SENT_FOR_APPROVAL",
      title: "New Block Awaiting Final Approval",
      message: `Block ${result.block_number} for ${quantity} boxes is waiting for final approval.`,
      audiences: ["MANAGERS", "SUPER_ADMINS"],
    });
  }

  return result;
}

/**
 * Returns reserved quantity to the available pool. Shared by reject, cancel,
 * release and expiry — all of which free stock without touching physical stock.
 * Caller must already hold the inventory row lock.
 */
async function releaseReservedQuantity(
  tx: any,
  inv: { id: string; availableStock: number; blockedStock: number; allocatedStock: number; stockStatus: string; warehouseId: string | null },
  block: { id: string; productId: string; quantity: number; status: string },
  { performedBy, reason, movementType = "BLOCK_RELEASED" }: { performedBy: string; reason: string; movementType?: string }
) {
  // Pre-shipment holds sit in blockedStock; nothing has moved to allocated yet.
  const qty = block.quantity;
  const newAvailable = inv.availableStock + qty;
  const newBlocked = Math.max(0, inv.blockedStock - qty);

  await tx.inventory.update({
    where: { id: inv.id },
    data: {
      availableStock: newAvailable,
      blockedStock: newBlocked,
      stockStatus: newAvailable > 0 ? "AVAILABLE" : inv.stockStatus,
    },
  });

  await tx.inventoryMovement.create({
    data: {
      inventoryId: inv.id,
      productId: block.productId,
      warehouseId: inv.warehouseId,
      movementType,
      quantity: qty,
      previousQuantity: inv.availableStock,
      newQuantity: newAvailable,
      referenceType: "BLOCK",
      referenceId: block.id,
      reason,
      performedBy,
    },
  });

  return { newAvailable, newBlocked };
}

/** Loads a block and locks its inventory row in one step. */
async function loadBlockForMutation(tx: any, blockId: string) {
  const block = await tx.stockBlock.findUnique({ where: { id: blockId } });
  if (!block) throw new Error("Stock block request not found.");
  const inv = await lockInventoryById(tx, block.inventoryId);
  if (!inv) throw new Error("Inventory record not found for this block.");
  return { block, inv };
}

/**
 * Approves a block at whichever stage it is currently in.
 *
 * Staff-created blocks pass through the In-Charge first (→ PENDING_MANAGER_APPROVAL),
 * then a Manager/Super Admin (→ APPROVED). Authority and legality of the
 * transition are both enforced here, not by the caller.
 */
export async function approveBlock({
  blockId,
  approvedBy,
  approvedById,
  role,
  approvedQuantity,
}: {
  blockId: string;
  approvedBy: string;
  approvedById?: string | null;
  role: string;
  approvedQuantity?: number;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertPermission(
      canApproveBlock(role as Role, block.status as BlockStatus, {
        createdById: block.createdById,
        actorId: approvedById,
      }),
      `Your role (${role}) cannot approve a block in state ${block.status}.`
    );

    // ——— Stage 1: In-Charge sign-off ———
    if (block.status === "PENDING_INCHARGE_APPROVAL") {
      assertTransition(block.status, "PENDING_MANAGER_APPROVAL");

      const updated = await tx.stockBlock.update({
        where: { id: blockId },
        data: {
          status: "PENDING_MANAGER_APPROVAL",
          inchargeApprovedBy: approvedBy,
          inchargeApprovedAt: new Date(),
        },
      });

      await recordBlockAudit(tx, {
        action: "APPROVE_BLOCK",
        blockId,
        userId: approvedById,
        userName: approvedBy,
        role,
        fromStatus: "PENDING_INCHARGE_APPROVAL",
        toStatus: "PENDING_MANAGER_APPROVAL",
        meta: { stage: "INCHARGE" },
      });

      return { block: updated, stage: "INCHARGE" as const, finalQty: block.quantity };
    }

    // ——— Stage 2: Manager / Super Admin final approval ———
    assertTransition(block.status, "APPROVED");

    const finalQty = approvedQuantity !== undefined ? approvedQuantity : block.quantity;
    if (finalQty <= 0) throw new Error("Approved quantity must be greater than zero.");
    if (finalQty > block.quantity) {
      throw new Error("Approved quantity cannot exceed the requested quantity.");
    }

    // Partial approval returns the unapproved remainder to available stock.
    if (finalQty < block.quantity) {
      const difference = block.quantity - finalQty;
      const newAvailable = inv.availableStock + difference;
      const newBlocked = Math.max(0, inv.blockedStock - difference);

      await tx.inventory.update({
        where: { id: inv.id },
        data: {
          availableStock: newAvailable,
          blockedStock: newBlocked,
          stockStatus: newAvailable > 0 ? "AVAILABLE" : inv.stockStatus,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: inv.id,
          productId: block.productId,
          warehouseId: inv.warehouseId,
          movementType: "BLOCK_RELEASED",
          quantity: difference,
          previousQuantity: inv.availableStock,
          newQuantity: newAvailable,
          referenceType: "BLOCK",
          referenceId: block.id,
          reason: `Partial approval — released ${difference} boxes.`,
          performedBy: approvedBy,
        },
      });
    }

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "APPROVED",
        quantity: finalQty,
        approvedBy,
        approvedAt: new Date(),
        managerApprovedBy: approvedBy,
        managerApprovedAt: new Date(),
        remarks:
          finalQty < block.quantity
            ? `${block.remarks || ""} (Partial approval: requested ${block.quantity}, approved ${finalQty})`.trim()
            : block.remarks,
      },
    });

    await recordBlockAudit(tx, {
      action: "APPROVE_BLOCK",
      blockId,
      userId: approvedById,
      userName: approvedBy,
      role,
      fromStatus: block.status,
      toStatus: "APPROVED",
      meta: { stage: "MANAGER", approvedQty: finalQty, requestedQty: block.quantity },
    });

    return { block: updated, stage: "MANAGER" as const, finalQty };
  }, STOCK_TX_OPTIONS);

  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");
  if (result.stage === "INCHARGE") {
    // §11 — In-Charge signed off; the Manager and Super Admin now have work.
    await notifyBlockParties(result.block, {
      type: "BLOCK_SENT_FOR_APPROVAL",
      title: "Block Awaiting Final Approval",
      message: `Block ${result.block.block_number} is waiting for final approval.`,
      audiences: ["MANAGERS", "SUPER_ADMINS"],
    });
  } else {
    // §13 — final approval; tell the creator, their showroom and Super Admin.
    await notifyBlockParties(result.block, {
      type: "BLOCK_APPROVED",
      title: "Stock Block Approved",
      message: `Block ${result.block.block_number} has been approved and is ready for shipment.`,
      audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
    });
  }

  return result.block;
}

/** Rejects a block at its current approval stage and frees the held stock. */
export async function rejectBlock({
  blockId,
  rejectedBy,
  rejectedById,
  role,
  reason,
}: {
  blockId: string;
  rejectedBy: string;
  rejectedById?: string | null;
  role: string;
  reason?: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertPermission(
      canRejectBlock(role as Role, block.status as BlockStatus, {
        createdById: block.createdById,
        actorId: rejectedById,
      }),
      `Your role (${role}) cannot reject a block in state ${block.status}.`
    );
    assertTransition(block.status, "REJECTED");

    await releaseReservedQuantity(tx, inv, block, {
      performedBy: rejectedBy,
      reason: reason || "Stock block rejected",
    });

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "REJECTED",
        remarks: reason ? `${block.remarks || ""} [Rejected: ${reason}]`.trim() : block.remarks,
      },
    });

    await recordBlockAudit(tx, {
      action: "REJECT_BLOCK",
      blockId,
      userId: rejectedById,
      userName: rejectedBy,
      role,
      fromStatus: block.status,
      toStatus: "REJECTED",
      reason,
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");
  await notifyBlockParties(result, {
    type: "BLOCK_REJECTED",
    title: "Stock Block Rejected",
    message: `Block ${result.block_number} was rejected.${reason ? ` Reason: ${reason}` : ""}`,
    priority: "HIGH",
    audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
  });

  return result;
}

/** APPROVED → READY_TO_SHIP. Manager/Super Admin only. */
export async function markBlockReadyToShip({
  blockId,
  performedBy,
  performedById,
  role,
}: {
  blockId: string;
  performedBy: string;
  performedById?: string | null;
  role: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const block = await tx.stockBlock.findUnique({ where: { id: blockId } });
    if (!block) throw new Error("Stock block request not found.");

    assertPermission(
      canMarkReadyToShip(role as Role, block.status as BlockStatus),
      `Your role (${role}) cannot mark a block ready to ship.`
    );
    assertTransition(block.status, "READY_TO_SHIP");

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: { status: "READY_TO_SHIP", readyToShipAt: new Date() },
    });

    await recordBlockAudit(tx, {
      action: "READY_TO_SHIP",
      blockId,
      userId: performedById,
      userName: performedBy,
      role,
      fromStatus: block.status,
      toStatus: "READY_TO_SHIP",
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateCache("inventory:*");
  return result;
}

/**
 * Ships all or part of a block.
 *
 * Shipping moves stock out of the blocked pool and reduces physical stock —
 * this is the point where the goods actually leave the warehouse.
 */
export async function shipBlock({
  blockId,
  quantity,
  performedBy,
  performedById,
  role,
}: {
  blockId: string;
  quantity?: number;
  performedBy: string;
  performedById?: string | null;
  role: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertPermission(
      canShipBlock(role as Role, block.status as BlockStatus),
      `Your role (${role}) cannot ship a block in state ${block.status}.`
    );

    const outstanding = block.quantity - block.shippedQuantity;
    const shipQty = quantity ?? outstanding;
    if (shipQty <= 0) throw new Error("Ship quantity must be greater than zero.");
    if (shipQty > outstanding) {
      throw new Error(`Cannot ship ${shipQty}; only ${outstanding} boxes remain on this block.`);
    }

    const totalShipped = block.shippedQuantity + shipQty;
    const nextStatus: BlockStatus = totalShipped >= block.quantity ? "SHIPPED" : "PARTIALLY_SHIPPED";
    assertTransition(block.status, nextStatus);

    // Physical stock leaves the building; the reservation is consumed.
    const newTotal = Math.max(0, inv.totalStock - shipQty);
    const newBlocked = Math.max(0, inv.blockedStock - shipQty);

    await tx.inventory.update({
      where: { id: inv.id },
      data: {
        totalStock: newTotal,
        blockedStock: newBlocked,
        stockStatus: newTotal <= 0 ? "OUT_OF_STOCK" : inv.stockStatus,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryId: inv.id,
        productId: block.productId,
        warehouseId: inv.warehouseId,
        movementType: "STOCK_DISPATCHED",
        quantity: shipQty,
        previousQuantity: inv.totalStock,
        newQuantity: newTotal,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: `Shipped ${shipQty} boxes`,
        performedBy,
      },
    });

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: nextStatus,
        shippedQuantity: totalShipped,
        shippedAt: new Date(),
      },
    });

    await recordBlockAudit(tx, {
      action: "SHIP_BLOCK",
      blockId,
      userId: performedById,
      userName: performedBy,
      role,
      fromStatus: block.status,
      toStatus: nextStatus,
      meta: { shippedNow: shipQty, shippedTotal: totalShipped, physicalAfter: newTotal },
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");
  await notifyBlockParties(result, {
    type: "BLOCK_SHIPPED",
    title: "Stock Shipped",
    message: `Block ${result.block_number} has been shipped.`,
    priority: "HIGH",
    audiences: ["CREATOR", "SHOWROOM_INCHARGE", "SUPER_ADMINS"],
  });

  return result;
}

/** Records delivery of shipped goods. Physical stock already left at ship time. */
export async function deliverBlock({
  blockId,
  quantity,
  performedBy,
  performedById,
  role,
}: {
  blockId: string;
  quantity?: number;
  performedBy: string;
  performedById?: string | null;
  role: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertPermission(
      canDeliverBlock(role as Role, block.status as BlockStatus),
      `Your role (${role}) cannot deliver a block in state ${block.status}.`
    );

    const outstanding = block.shippedQuantity - block.deliveredQuantity;
    const deliverQty = quantity ?? outstanding;
    if (deliverQty <= 0) throw new Error("Delivery quantity must be greater than zero.");
    if (deliverQty > outstanding) {
      throw new Error(`Cannot deliver ${deliverQty}; only ${outstanding} shipped boxes are undelivered.`);
    }

    const totalDelivered = block.deliveredQuantity + deliverQty;
    const nextStatus: BlockStatus = totalDelivered >= block.quantity ? "DELIVERED" : "PARTIALLY_DELIVERED";
    assertTransition(block.status, nextStatus);

    // Physical stock was already reduced on shipment; this only records receipt.
    await tx.inventory.update({
      where: { id: inv.id },
      data: { deliveredStock: inv.deliveredStock + deliverQty },
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryId: inv.id,
        productId: block.productId,
        warehouseId: inv.warehouseId,
        movementType: "STOCK_DELIVERED",
        quantity: deliverQty,
        previousQuantity: inv.deliveredStock,
        newQuantity: inv.deliveredStock + deliverQty,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: `Delivered ${deliverQty} boxes`,
        performedBy,
      },
    });

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: nextStatus,
        deliveredQuantity: totalDelivered,
        deliveredAt: new Date(),
      },
    });

    await recordBlockAudit(tx, {
      action: "DELIVER_BLOCK",
      blockId,
      userId: performedById,
      userName: performedBy,
      role,
      fromStatus: block.status,
      toStatus: nextStatus,
      meta: { deliveredNow: deliverQty, deliveredTotal: totalDelivered },
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");
  await notifyBlockParties(result, {
    type: "BLOCK_DELIVERED",
    title: "Stock Delivered",
    message: `Block ${result.block_number} has been delivered.`,
    audiences: ["CREATOR", "SHOWROOM_INCHARGE", "SUPER_ADMINS"],
  });

  return result;
}

/** Cancels an active block. Creators may cancel their own; Managers, any. */
export async function cancelBlock({
  blockId,
  performedBy,
  performedById,
  role,
  reason,
}: {
  blockId: string;
  performedBy: string;
  performedById?: string | null;
  role: string;
  reason?: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertPermission(
      canCancelBlock(role as Role, block.status as BlockStatus, {
        createdById: block.createdById,
        actorId: performedById,
      }),
      `Your role (${role}) cannot cancel this block.`
    );
    assertTransition(block.status, "CANCELLED");

    await releaseReservedQuantity(tx, inv, block, {
      performedBy,
      reason: reason || "Block cancelled",
    });

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        remarks: reason ? `${block.remarks || ""} [Cancelled: ${reason}]`.trim() : block.remarks,
      },
    });

    await recordBlockAudit(tx, {
      action: "CANCEL_BLOCK",
      blockId,
      userId: performedById,
      userName: performedBy,
      role,
      fromStatus: block.status,
      toStatus: "CANCELLED",
      reason,
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");
  await notifyBlockParties(result, {
    type: "BLOCK_CANCELLED",
    title: "Stock Block Cancelled",
    message: `Block ${result.block_number} was cancelled and its stock released.`,
    audiences: ["CREATOR", "SHOWROOM_INCHARGE", "SUPER_ADMINS"],
  });
  return result;
}

/** Manager-initiated release of an active block's reserved stock. */
export async function releaseBlock({
  blockId,
  releasedBy,
  releasedById,
  role = "SUPER_ADMIN",
  reason,
  skipPermissionCheck = false,
}: {
  blockId: string;
  releasedBy: string;
  releasedById?: string | null;
  role?: string;
  reason?: string;
  /** Set by the expiry worker, which acts as the system rather than a user. */
  skipPermissionCheck?: boolean;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    if (!skipPermissionCheck) {
      assertPermission(
        canReleaseBlock(role as Role, block.status as BlockStatus),
        `Your role (${role}) cannot release a block in state ${block.status}.`
      );
    }
    assertTransition(block.status, "RELEASED");

    await releaseReservedQuantity(tx, inv, block, {
      performedBy: releasedBy,
      reason: reason || "Stock block released",
    });

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        remarks: reason ? `${block.remarks || ""} [Released: ${reason}]`.trim() : block.remarks,
      },
    });

    await recordBlockAudit(tx, {
      action: "RELEASE_BLOCK",
      blockId,
      userId: releasedById,
      userName: releasedBy,
      role,
      fromStatus: block.status,
      toStatus: "RELEASED",
      reason,
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");
  await notifyBlockParties(result, {
    type: "BLOCK_RELEASED",
    title: "Stock Reservation Released",
    message: `Block ${result.block_number} was released and its stock returned to available.`,
    audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
  });
  return result;
}

/**
 * Expires a block whose hold has lapsed, returning its stock.
 * Used by the scheduled worker; bypasses the interactive-user permission check.
 */
export async function expireBlock({ blockId }: { blockId: string }) {
  return await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);
    assertTransition(block.status, "EXPIRED");

    await releaseReservedQuantity(tx, inv, block, {
      performedBy: "SYSTEM",
      reason: "Reservation expired",
    });

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: { status: "EXPIRED", releasedAt: new Date() },
    });

    await recordBlockAudit(tx, {
      action: "EXPIRE_BLOCK",
      blockId,
      userName: "SYSTEM",
      role: "SYSTEM",
      fromStatus: block.status,
      toStatus: "EXPIRED",
      reason: "Automatic expiry of lapsed reservation",
    });

    return updated;
  }, STOCK_TX_OPTIONS);
}

/**
 * Who should hear about a block event.
 *
 * Spec §10-15 are specific about this — e.g. a staff-created block notifies
 * the In-Charge *only*, deliberately not the Manager, because the Manager has
 * nothing to act on until the In-Charge has signed off.
 */
type BlockAudience = "CREATOR" | "SHOWROOM" | "SHOWROOM_INCHARGE" | "MANAGERS" | "SUPER_ADMINS";

type NotifiableBlock = {
  id: string;
  block_number: string | null;
  createdById: string | null;
  showroomId: string | null;
  dealerId: string | null;
  warehouseId: string | null;
  requestedBy: string;
};

/** Resolves an audience list to a de-duplicated set of user ids. */
async function resolveAudience(block: NotifiableBlock, audiences: BlockAudience[]): Promise<string[]> {
  const ids = new Set<string>();

  for (const audience of audiences) {
    if (audience === "CREATOR") {
      if (block.createdById) ids.add(block.createdById);
      continue;
    }
    if (audience === "SHOWROOM") {
      if (!block.showroomId) continue;
      const users = await db.user.findMany({ where: { showroomId: block.showroomId }, select: { id: true } });
      users.forEach((u) => ids.add(u.id));
      continue;
    }
    if (audience === "SHOWROOM_INCHARGE") {
      if (!block.showroomId) continue;
      const users = await db.user.findMany({
        where: { showroomId: block.showroomId, role: "SHOWROOM_INCHARGE" },
        select: { id: true },
      });
      users.forEach((u) => ids.add(u.id));
      continue;
    }
    if (audience === "MANAGERS") {
      const users = await db.user.findMany({ where: { role: "MANAGER" }, select: { id: true } });
      users.forEach((u) => ids.add(u.id));
      continue;
    }
    if (audience === "SUPER_ADMINS") {
      const users = await db.user.findMany({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
      users.forEach((u) => ids.add(u.id));
    }
  }

  return [...ids];
}

async function notifyBlockParties(
  block: NotifiableBlock,
  {
    type,
    title,
    message,
    priority = "NORMAL",
    audiences,
  }: {
    type: string;
    title: string;
    message: string;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    audiences: BlockAudience[];
  }
) {
  try {
    const userIds = await resolveAudience(block, audiences);
    if (userIds.length === 0) return;

    await sendNotificationsToUsers({
      userIds,
      type,
      title,
      message,
      priority,
      data: { blockId: block.id, blockNumber: block.block_number },
    });
  } catch (err) {
    // Notification failure must never roll back a completed stock movement.
    console.error("[BLOCK NOTIFY] failed:", err);
  }
}

export async function releaseExpiredBlocks() {
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // 1. Send warning notifications for blocks expiring in the next 2 hours
  const expiringSoon = await db.stockBlock.findMany({
    where: {
      status: { in: [...ACTIVE_BLOCK_STATUSES] },
      expiresAt: { gte: now, lte: twoHoursFromNow },
    },
  });

  for (const block of expiringSoon) {
    await notifyBlockParties(block, {
      type: "BLOCK_EXPIRING",
      title: "Reservation Expiring Soon",
      message: `Block ${block.block_number} expires in less than 2 hours.`,
      priority: "HIGH",
      audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
    });
  }

  // 2. Expire blocks that have passed their expiry date. `expireBlock` performs
  // the release and the status change as one guarded transition — the previous
  // code released then force-wrote EXPIRED, which the state machine now rejects
  // (RELEASED is terminal).
  const expiredBlocks = await db.stockBlock.findMany({
    where: {
      status: { in: [...ACTIVE_BLOCK_STATUSES] },
      expiresAt: { lte: now },
    },
  });

  console.log(`[EXPIRATION WORKER] Found ${expiredBlocks.length} expired stock blocks.`);

  let releasedCount = 0;
  for (const block of expiredBlocks) {
    try {
      await expireBlock({ blockId: block.id });

      await notifyBlockParties(block, {
        type: "BLOCK_EXPIRED",
        title: "Reservation Expired",
        message: `Block ${block.block_number} has expired and the stock has been released.`,
        priority: "HIGH",
        audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
      });

      releasedCount++;
    } catch (err) {
      console.error(`[EXPIRATION WORKER] Failed releasing block ${block.id}:`, err);
    }
  }

  if (releasedCount > 0) {
    await invalidateCache("inventory:*");
    await invalidateCache("dashboard:*");
  }

  return { found: expiredBlocks.length, released: releasedCount, warningsSent: expiringSoon.length };
}
