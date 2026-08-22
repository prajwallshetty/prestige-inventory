import { db, STOCK_TX_OPTIONS } from "@/lib/db";
import { sendNotificationsToUsers } from "@/services/NotificationService";
import { invalidateCache } from "@/lib/redis";
import {
  AppError,
  conflict,
  type Role,
  type BlockStatus,
  EXPIRABLE_BLOCK_STATUSES,
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
  isInScope,
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
 * They are nonetheless kept as short as the latency allows: an interactive
 * transaction holds a pooled connection for its whole life, so a generous
 * timeout under load turns into pool exhaustion for everybody else (spec §41).
 */
interface LockedInventory {
  id: string;
  totalStock: number;
  availableStock: number;
  blockedStock: number;
  allocatedStock: number;
  damagedStock: number;
  deliveredStock: number;
  transitStock: number;
  /** Held by the booking module; counts against blockable stock. */
  reservedStock: number;
  reorderLevel: number;
  stockStatus: string;
  warehouseId: string | null;
}

interface LockedBlock {
  id: string;
  block_number: string | null;
  status: string;
  quantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  productId: string;
  inventoryId: string;
  showroomId: string | null;
  dealerId: string | null;
  warehouseId: string | null;
  createdById: string | null;
  createdRole: string | null;
  requestedBy: string;
  remarks: string | null;
  approvalRoute: string;
  expiresAt: Date | null;
}

const INVENTORY_COLUMNS = `id, "totalStock", "availableStock", "blockedStock", "allocatedStock",
           "damagedStock", "deliveredStock", "transitStock", "reservedStock",
           "reorderLevel", "stockStatus", "warehouseId"`;

/**
 * Locks a product's inventory row for the remainder of the transaction.
 *
 * `SELECT … FOR UPDATE` is the whole point: a plain findUnique lets two
 * concurrent transactions both read the same availability, both pass the
 * check, and both write — which double-reserves stock and loses one update.
 * Every path that changes reserved quantities must go through this first.
 */
async function lockInventoryByProduct(tx: any, productId: string): Promise<LockedInventory | null> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT ${INVENTORY_COLUMNS} FROM "Inventory" WHERE "productId" = $1 FOR UPDATE`,
    productId
  )) as LockedInventory[];
  return rows[0] ?? null;
}

async function lockInventoryById(tx: any, inventoryId: string): Promise<LockedInventory | null> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT ${INVENTORY_COLUMNS} FROM "Inventory" WHERE id = $1 FOR UPDATE`,
    inventoryId
  )) as LockedInventory[];
  return rows[0] ?? null;
}

/**
 * Locks the block row itself and returns its *post-lock* state.
 *
 * This is what makes double-approval and double-shipping impossible. The
 * previous implementation read the block with `findUnique` and only locked the
 * inventory row afterwards: two concurrent "Ship" clicks both read
 * READY_TO_SHIP, then queued on the inventory lock and the loser proceeded on
 * a status that was already stale — shipping the same goods twice and
 * decrementing physical stock twice. Taking the block lock first means the
 * second transaction blocks here and reads SHIPPED, so its transition check
 * fails cleanly with "already been shipped".
 */
async function lockBlock(tx: any, blockId: string): Promise<LockedBlock | null> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT id, block_number, status, quantity, "shippedQuantity", "deliveredQuantity",
            "productId", "inventoryId", "showroomId", "dealerId", "warehouseId",
            "createdById", "createdRole", "requestedBy", remarks, "approvalRoute", "expiresAt"
       FROM "StockBlock"
      WHERE id = $1
      FOR UPDATE`,
    blockId
  )) as LockedBlock[];
  return rows[0] ?? null;
}

/** Loads and locks a block plus its inventory row, in a consistent order. */
async function loadBlockForMutation(tx: any, blockId: string) {
  const block = await lockBlock(tx, blockId);
  if (!block) throw new AppError("Stock block request not found.", 404, "NOT_FOUND");
  const inv = await lockInventoryById(tx, block.inventoryId);
  if (!inv) throw new AppError("Inventory record not found for this block.", 404, "NOT_FOUND");
  return { block, inv };
}

/**
 * Physical stock minus everything already spoken for.
 *
 * The single definition of blockable stock, applied identically when the form
 * displays a number and when the server validates against it.
 *
 * `reservedStock` counts here because the booking module reserves into it
 * (BookingService.reviewBooking). Omitting it let a booking and a block commit
 * the same boxes twice — the block path recomputed availability from physical
 * stock, which silently discarded the booking's reservation (spec §6:
 * available = physical − active blocks − OTHER VALID RESERVATIONS).
 */
function availableFrom(inv: {
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

function deriveStockStatus(inv: {
  totalStock: number;
  blockedStock: number;
  allocatedStock: number;
  damagedStock: number;
  reservedStock?: number;
  transitStock: number;
  reorderLevel: number;
}): string {
  const available = availableFrom(inv);
  if (available <= 0) {
    if (inv.transitStock > 0) return "INCOMING";
    if (inv.totalStock <= 0) return "OUT_OF_STOCK";
    return "BLOCKED";
  }
  if (inv.reorderLevel > 0 && available <= inv.reorderLevel) return "LOW_STOCK";
  return "AVAILABLE";
}

/**
 * Writes an inventory change, recomputing the derived columns from the
 * physical figures rather than adjusting the stored `availableStock`.
 *
 * Deriving from physical stock is self-correcting: if the column had drifted
 * (an older code path, a manual edit), the next mutation puts it right instead
 * of carrying the error forward for ever.
 */
async function writeInventory(
  tx: any,
  inv: LockedInventory,
  delta: Partial<Pick<LockedInventory, "totalStock" | "blockedStock" | "allocatedStock" | "damagedStock" | "transitStock" | "deliveredStock">>
) {
  const next = {
    totalStock: Math.max(0, delta.totalStock ?? inv.totalStock),
    blockedStock: Math.max(0, delta.blockedStock ?? inv.blockedStock),
    allocatedStock: Math.max(0, delta.allocatedStock ?? inv.allocatedStock),
    damagedStock: Math.max(0, delta.damagedStock ?? inv.damagedStock),
    transitStock: Math.max(0, delta.transitStock ?? inv.transitStock),
    deliveredStock: Math.max(0, delta.deliveredStock ?? inv.deliveredStock),
    reorderLevel: inv.reorderLevel,
  };

  const availableStock = availableFrom(next);
  const stockStatus = deriveStockStatus(next);

  await tx.inventory.update({
    where: { id: inv.id },
    data: {
      totalStock: next.totalStock,
      blockedStock: next.blockedStock,
      allocatedStock: next.allocatedStock,
      damagedStock: next.damagedStock,
      transitStock: next.transitStock,
      deliveredStock: next.deliveredStock,
      availableStock,
      stockStatus,
    },
  });

  return { ...next, availableStock, stockStatus };
}

async function recordMovement(
  tx: any,
  {
    inv,
    productId,
    movementType,
    quantity,
    previousQuantity,
    newQuantity,
    referenceId,
    reason,
    performedBy,
  }: {
    inv: LockedInventory;
    productId: string;
    movementType: string;
    quantity: number;
    previousQuantity: number;
    newQuantity: number;
    referenceId: string;
    reason: string;
    performedBy: string;
  }
) {
  await tx.inventoryMovement.create({
    data: {
      inventoryId: inv.id,
      productId,
      warehouseId: inv.warehouseId,
      movementType,
      quantity,
      previousQuantity,
      newQuantity,
      referenceType: "BLOCK",
      referenceId,
      reason,
      performedBy,
    },
  });
}

/**
 * Allocates the next human-readable block number, e.g. BLK-2026-000001.
 *
 * Runs inside the caller's transaction and relies on an atomic upsert+increment,
 * so two concurrent creations can never receive the same number.
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
 *
 * The message is written for the operator, because losing a race is a normal
 * event: two people opened the same queue and one clicked first.
 */
function assertTransition(from: string, to: BlockStatus) {
  if (canTransition(from as BlockStatus, to)) return;

  const readable: Record<string, string> = {
    SHIPPED: "This block has already been shipped.",
    DELIVERED: "This block has already been delivered.",
    CANCELLED: "This block has already been cancelled.",
    REJECTED: "This block has already been rejected.",
    EXPIRED: "This block has expired.",
    RELEASED: "This block has already been released.",
  };

  if (readable[from]) throw conflict(readable[from]);
  throw conflict(
    `This block is no longer available for that action — it is currently ${from.replace(/_/g, " ").toLowerCase()}.`
  );
}

/** Scope guard shared by every block mutation. */
function assertScope(
  role: Role,
  block: { showroomId: string | null },
  actor: { showroomId?: string | null }
) {
  assertPermission(
    isInScope(role, { blockShowroomId: block.showroomId, actorShowroomId: actor.showroomId }),
    "This block belongs to a different showroom."
  );
}

/** Caches touched by any stock or block mutation. */
async function invalidateStockCaches() {
  await Promise.all([
    invalidateCache("inventory:*"),
    invalidateCache("dashboard:*"),
    invalidateCache("blocks:*"),
    invalidateCache("search:*"),
  ]);
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
  if (!productId) throw new AppError("Please select a product.", 400, "VALIDATION");
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError("Block quantity must be greater than zero.", 400, "VALIDATION");
  }
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new AppError("Hold duration must be greater than zero.", 400, "VALIDATION");
  }

  // ——— Pre-transaction validation of referenced records ———
  // Kept outside the stock transaction so the inventory row is locked for as
  // short a time as possible (spec §41).
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, status: true, deletedAt: true },
  });
  if (!product || product.deletedAt) {
    throw new AppError("That product no longer exists.", 404, "NOT_FOUND");
  }
  if (product.status !== "ACTIVE") {
    throw new AppError(`"${product.name}" is not active and cannot be blocked.`, 400, "VALIDATION");
  }

  if (dealerId) {
    const dealer = await db.dealer.findUnique({
      where: { id: dealerId },
      select: { id: true, status: true, name: true },
    });
    if (!dealer) throw new AppError("That dealer no longer exists.", 404, "NOT_FOUND");
    if (dealer.status !== "ACTIVE") {
      throw new AppError(`Dealer "${dealer.name}" is inactive.`, 400, "VALIDATION");
    }
  }

  if (showroomId) {
    const showroom = await db.showroom.findUnique({ where: { id: showroomId }, select: { id: true } });
    if (!showroom) throw new AppError("That showroom no longer exists.", 404, "NOT_FOUND");
  }

  // Showroom roles must be attached to a showroom, or their block would be
  // invisible to their own approval queue.
  if ((userRole === "SHOWROOM_STAFF" || userRole === "SHOWROOM_INCHARGE") && !showroomId) {
    throw new AppError(
      "Your account is not assigned to a showroom. Ask an administrator to assign one before creating blocks.",
      400,
      "NO_SHOWROOM"
    );
  }

  const result = await db.$transaction(async (tx) => {
    // Serialise on the inventory row. Everything below reads post-lock values,
    // so a concurrent transaction cannot reserve the same stock.
    const inventory = await lockInventoryByProduct(tx, productId);
    if (!inventory) {
      throw new AppError("No inventory record exists for this product.", 404, "NOT_FOUND");
    }

    const available = availableFrom(inventory);
    if (available < quantity) {
      throw new AppError(
        `Insufficient available stock — only ${available} ${available === 1 ? "box is" : "boxes are"} available to block (you asked for ${quantity}).`,
        409,
        "INSUFFICIENT_STOCK"
      );
    }

    // Approval route is derived from the creator's role, never from the
    // client: staff blocks must clear the In-Charge first, everyone else
    // goes straight to the Manager queue.
    const isStaff = userRole === "SHOWROOM_STAFF";
    const status: BlockStatus = isStaff ? "PENDING_INCHARGE_APPROVAL" : "PENDING_MANAGER_APPROVAL";
    const approvalRoute = isStaff ? "INCHARGE" : "DIRECT";

    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

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
    const after = await writeInventory(tx, inventory, {
      blockedStock: inventory.blockedStock + quantity,
    });

    await recordMovement(tx, {
      inv: inventory,
      productId,
      movementType: "BLOCK_CREATED",
      quantity,
      previousQuantity: available,
      newQuantity: after.availableStock,
      referenceId: block.id,
      reason: remarks || "Stock block requested",
      performedBy: requestedBy,
    });

    await recordBlockAudit(tx, {
      action: "CREATE_BLOCK",
      blockId: block.id,
      userId: createdById,
      userName: requestedBy,
      role: userRole,
      toStatus: status,
      reason: remarks,
      meta: { blockNumber: block.block_number, quantity, productName: product.name },
    });

    return block;
  }, STOCK_TX_OPTIONS);

  // Side effects run after the commit so the transaction never waits on a
  // notification write or a Redis round trip (spec §41).
  await invalidateStockCaches();

  if (result.status === "PENDING_INCHARGE_APPROVAL") {
    // §10 — a staff block goes to the In-Charge only. The Manager is
    // deliberately not told yet; they have nothing to act on until the
    // In-Charge signs off.
    await notifyBlockParties(result, {
      type: "BLOCK_CREATED",
      title: "Block Awaiting Your Approval",
      message: `New block ${result.block_number} for ${quantity} boxes is waiting for your approval.`,
      audiences: ["SHOWROOM_INCHARGE"],
    });
  } else {
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
 * Caller must already hold both row locks.
 */
async function releaseReservedQuantity(
  tx: any,
  inv: LockedInventory,
  block: LockedBlock,
  { performedBy, reason, movementType = "BLOCK_RELEASED" }: { performedBy: string; reason: string; movementType?: string }
) {
  // Only the part of the hold that is still reserved comes back. A block that
  // shipped part of its quantity already had that portion removed from
  // `blockedStock`, so releasing the full quantity would inflate availability.
  const stillReserved = Math.max(0, block.quantity - block.shippedQuantity);
  const previousAvailable = availableFrom(inv);

  const after = await writeInventory(tx, inv, {
    blockedStock: inv.blockedStock - stillReserved,
  });

  await recordMovement(tx, {
    inv,
    productId: block.productId,
    movementType,
    quantity: stillReserved,
    previousQuantity: previousAvailable,
    newQuantity: after.availableStock,
    referenceId: block.id,
    reason,
    performedBy,
  });

  return after;
}

/**
 * Approves a block at whichever stage it is currently in.
 *
 * Staff-created blocks pass through the In-Charge first (→ PENDING_MANAGER_APPROVAL),
 * then a Manager/Super Admin (→ READY_TO_SHIP). Authority, showroom scope and
 * the legality of the transition are all enforced here, not by the caller.
 */
export async function approveBlock({
  blockId,
  approvedBy,
  approvedById,
  role,
  actorShowroomId,
  approvedQuantity,
}: {
  blockId: string;
  approvedBy: string;
  approvedById?: string | null;
  role: string;
  actorShowroomId?: string | null;
  approvedQuantity?: number;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertScope(role as Role, block, { showroomId: actorShowroomId });
    assertPermission(
      canApproveBlock(role as Role, block.status as BlockStatus, {
        createdById: block.createdById,
        actorId: approvedById,
        blockShowroomId: block.showroomId,
        actorShowroomId,
      }),
      approvalDenialMessage(role, block, approvedById)
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
    // Final approval lands directly on READY_TO_SHIP (spec §4/§10): the
    // Manager who approves is the Manager who ships, and an intermediate
    // APPROVED state left every block un-shippable until someone found a
    // second button.
    assertTransition(block.status, "READY_TO_SHIP");

    const finalQty = approvedQuantity !== undefined ? approvedQuantity : block.quantity;
    if (!Number.isFinite(finalQty) || finalQty <= 0) {
      throw new AppError("Approved quantity must be greater than zero.", 400, "VALIDATION");
    }
    if (finalQty > block.quantity) {
      throw new AppError(
        `Approved quantity cannot exceed the requested ${block.quantity} boxes.`,
        400,
        "VALIDATION"
      );
    }

    // Partial approval returns the unapproved remainder to available stock.
    if (finalQty < block.quantity) {
      const difference = block.quantity - finalQty;
      const previousAvailable = availableFrom(inv);
      const after = await writeInventory(tx, inv, {
        blockedStock: inv.blockedStock - difference,
      });

      await recordMovement(tx, {
        inv,
        productId: block.productId,
        movementType: "BLOCK_RELEASED",
        quantity: difference,
        previousQuantity: previousAvailable,
        newQuantity: after.availableStock,
        referenceId: block.id,
        reason: `Partial approval — released ${difference} boxes.`,
        performedBy: approvedBy,
      });
    }

    const now = new Date();
    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "READY_TO_SHIP",
        quantity: finalQty,
        approvedBy,
        approvedAt: now,
        managerApprovedBy: approvedBy,
        managerApprovedAt: now,
        readyToShipAt: now,
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
      toStatus: "READY_TO_SHIP",
      meta: { stage: "MANAGER", approvedQty: finalQty, requestedQty: block.quantity },
    });

    return { block: updated, stage: "MANAGER" as const, finalQty };
  }, STOCK_TX_OPTIONS);

  await invalidateStockCaches();

  if (result.stage === "INCHARGE") {
    // §11 — In-Charge signed off; the Manager and Super Admin now have work.
    await notifyBlockParties(result.block, {
      type: "BLOCK_SENT_FOR_APPROVAL",
      title: "Block Awaiting Final Approval",
      message: `Block ${result.block.block_number} is waiting for final approval.`,
      audiences: ["MANAGERS", "SUPER_ADMINS"],
    });
    // The creator should see their request advance.
    await notifyBlockParties(result.block, {
      type: "BLOCK_APPROVED_BY_INCHARGE",
      title: "Block Approved by In-Charge",
      message: `Block ${result.block.block_number} was approved and sent for final approval.`,
      audiences: ["CREATOR"],
    });
  } else {
    // §13 — final approval; tell the creator, their showroom and Super Admin.
    await notifyBlockParties(result.block, {
      type: "BLOCK_APPROVED",
      title: "Stock Block Approved",
      message: `Block ${result.block.block_number} has been approved and is ready to ship.`,
      audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
    });
  }

  return result.block;
}

/** Explains an approval refusal in the operator's terms rather than the code's. */
function approvalDenialMessage(role: string, block: LockedBlock, actorId?: string | null): string {
  if (
    block.status === "PENDING_INCHARGE_APPROVAL" &&
    role === "SHOWROOM_INCHARGE" &&
    actorId &&
    block.createdById === actorId
  ) {
    return "You cannot approve a block you created yourself. Another In-Charge or an administrator must review it.";
  }
  if (block.status === "PENDING_INCHARGE_APPROVAL" && role === "MANAGER") {
    return "This block is still awaiting Showroom In-Charge approval.";
  }
  if (block.status === "PENDING_MANAGER_APPROVAL" && role === "SHOWROOM_INCHARGE") {
    return "This block has already been approved and is awaiting a Manager.";
  }
  return "You don't have permission to approve this block.";
}

/** Rejects a block at its current approval stage and frees the held stock. */
export async function rejectBlock({
  blockId,
  rejectedBy,
  rejectedById,
  role,
  actorShowroomId,
  reason,
}: {
  blockId: string;
  rejectedBy: string;
  rejectedById?: string | null;
  role: string;
  actorShowroomId?: string | null;
  reason?: string;
}) {
  // §9 — a rejection reason is mandatory, and enforced server-side rather than
  // by the dialog alone.
  const trimmedReason = (reason || "").trim();
  if (!trimmedReason) {
    throw new AppError("A rejection reason is required.", 400, "VALIDATION");
  }

  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertScope(role as Role, block, { showroomId: actorShowroomId });
    assertPermission(
      canRejectBlock(role as Role, block.status as BlockStatus, {
        createdById: block.createdById,
        actorId: rejectedById,
        blockShowroomId: block.showroomId,
        actorShowroomId,
      }),
      approvalDenialMessage(role, block, rejectedById)
    );
    assertTransition(block.status, "REJECTED");

    await releaseReservedQuantity(tx, inv, block, {
      performedBy: rejectedBy,
      reason: `Rejected: ${trimmedReason}`,
    });

    const updated = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "REJECTED",
        remarks: `${block.remarks || ""} [Rejected: ${trimmedReason}]`.trim(),
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
      reason: trimmedReason,
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateStockCaches();
  await notifyBlockParties(result, {
    type: "BLOCK_REJECTED",
    title: "Stock Block Rejected",
    message: `Block ${result.block_number} was rejected. Reason: ${trimmedReason}`,
    priority: "HIGH",
    audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
  });

  return result;
}

/** Legacy APPROVED → READY_TO_SHIP. Manager/Super Admin only. */
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
    const block = await lockBlock(tx, blockId);
    if (!block) throw new AppError("Stock block request not found.", 404, "NOT_FOUND");

    assertPermission(
      canMarkReadyToShip(role as Role, block.status as BlockStatus),
      "You don't have permission to mark this block ready to ship."
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

  await invalidateStockCaches();
  return result;
}

/**
 * Ships all or part of a block.
 *
 * Shipping moves stock out of the blocked pool, reduces physical stock and
 * puts the same quantity in transit — this is the point where the goods
 * actually leave the warehouse.
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
      role === "SUPER_ADMIN" || role === "MANAGER"
        ? shipDenialMessage(block.status)
        : "Only a Manager or Super Admin can ship a block."
    );

    const outstanding = block.quantity - block.shippedQuantity;
    const shipQty = quantity ?? outstanding;
    if (!Number.isFinite(shipQty) || shipQty <= 0) {
      throw new AppError("Ship quantity must be greater than zero.", 400, "VALIDATION");
    }
    if (shipQty > outstanding) {
      throw new AppError(
        `Cannot ship ${shipQty} boxes — only ${outstanding} remain on this block.`,
        400,
        "VALIDATION"
      );
    }

    const totalShipped = block.shippedQuantity + shipQty;
    const nextStatus: BlockStatus = totalShipped >= block.quantity ? "SHIPPED" : "PARTIALLY_SHIPPED";
    assertTransition(block.status, nextStatus);

    // Physical stock leaves the building, the reservation is consumed, and the
    // same quantity becomes in-transit until delivery is confirmed.
    const after = await writeInventory(tx, inv, {
      totalStock: inv.totalStock - shipQty,
      blockedStock: inv.blockedStock - shipQty,
      transitStock: inv.transitStock + shipQty,
    });

    await recordMovement(tx, {
      inv,
      productId: block.productId,
      movementType: "STOCK_DISPATCHED",
      quantity: shipQty,
      previousQuantity: inv.totalStock,
      newQuantity: after.totalStock,
      referenceId: block.id,
      reason: `Shipped ${shipQty} boxes`,
      performedBy,
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
      meta: { shippedNow: shipQty, shippedTotal: totalShipped, physicalAfter: after.totalStock },
    });

    return updated;
  }, STOCK_TX_OPTIONS);

  await invalidateStockCaches();
  await notifyBlockParties(result, {
    type: "BLOCK_SHIPPED",
    title: "Stock Shipped",
    message: `Block ${result.block_number} has been shipped.`,
    priority: "HIGH",
    audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
  });

  return result;
}

function shipDenialMessage(status: string): string {
  switch (status) {
    case "SHIPPED":
      return "This block has already been shipped.";
    case "DELIVERED":
      return "This block has already been delivered.";
    case "CANCELLED":
      return "This block was cancelled and cannot be shipped.";
    case "REJECTED":
      return "This block was rejected and cannot be shipped.";
    case "EXPIRED":
      return "This block has expired and cannot be shipped.";
    case "RELEASED":
      return "This block was released and cannot be shipped.";
    default:
      return "This block is not approved for shipping yet.";
  }
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
      role === "SUPER_ADMIN" || role === "MANAGER"
        ? block.status === "DELIVERED"
          ? "This block has already been delivered."
          : "This block has not been shipped yet."
        : "Only a Manager or Super Admin can record a delivery."
    );

    const outstanding = block.shippedQuantity - block.deliveredQuantity;
    const deliverQty = quantity ?? outstanding;
    if (!Number.isFinite(deliverQty) || deliverQty <= 0) {
      throw new AppError("Delivery quantity must be greater than zero.", 400, "VALIDATION");
    }
    if (deliverQty > outstanding) {
      throw new AppError(
        `Cannot deliver ${deliverQty} boxes — only ${outstanding} shipped ${outstanding === 1 ? "box is" : "boxes are"} undelivered.`,
        400,
        "VALIDATION"
      );
    }

    const totalDelivered = block.deliveredQuantity + deliverQty;
    const nextStatus: BlockStatus = totalDelivered >= block.quantity ? "DELIVERED" : "PARTIALLY_DELIVERED";
    assertTransition(block.status, nextStatus);

    // Physical stock was already reduced on shipment; delivery closes out the
    // in-transit quantity and records receipt.
    const after = await writeInventory(tx, inv, {
      transitStock: inv.transitStock - deliverQty,
      deliveredStock: inv.deliveredStock + deliverQty,
    });

    await recordMovement(tx, {
      inv,
      productId: block.productId,
      movementType: "STOCK_DELIVERED",
      quantity: deliverQty,
      previousQuantity: inv.deliveredStock,
      newQuantity: after.deliveredStock,
      referenceId: block.id,
      reason: `Delivered ${deliverQty} boxes`,
      performedBy,
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

  await invalidateStockCaches();
  await notifyBlockParties(result, {
    type: "BLOCK_DELIVERED",
    title: "Stock Delivered",
    message: `Block ${result.block_number} has been delivered.`,
    audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
  });

  return result;
}

/** Cancels an active block. Creators may cancel their own; Managers, any. */
export async function cancelBlock({
  blockId,
  performedBy,
  performedById,
  role,
  actorShowroomId,
  reason,
}: {
  blockId: string;
  performedBy: string;
  performedById?: string | null;
  role: string;
  actorShowroomId?: string | null;
  reason?: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const { block, inv } = await loadBlockForMutation(tx, blockId);

    assertScope(role as Role, block, { showroomId: actorShowroomId });
    assertPermission(
      canCancelBlock(role as Role, block.status as BlockStatus, {
        createdById: block.createdById,
        actorId: performedById,
        blockShowroomId: block.showroomId,
        actorShowroomId,
      }),
      cancelDenialMessage(role, block, performedById)
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

  await invalidateStockCaches();
  await notifyBlockParties(result, {
    type: "BLOCK_CANCELLED",
    title: "Stock Block Cancelled",
    message: `Block ${result.block_number} was cancelled and its stock released.`,
    audiences: ["CREATOR", "SHOWROOM_INCHARGE", "SUPER_ADMINS"],
  });
  return result;
}

/** Explains a cancellation refusal by its actual cause, most specific first. */
function cancelDenialMessage(role: string, block: LockedBlock, actorId?: string | null): string {
  if (block.status === "DELIVERED") return "A delivered block cannot be cancelled.";
  if (block.status === "SHIPPED") return "A shipped block cannot be cancelled.";
  if (block.status === "PARTIALLY_SHIPPED") {
    return "Part of this block has already shipped, so it can no longer be cancelled.";
  }
  if (["CANCELLED", "REJECTED", "EXPIRED", "RELEASED"].includes(block.status)) {
    return `This block is already ${block.status.toLowerCase()}.`;
  }
  if (
    (role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") &&
    block.createdById &&
    actorId &&
    block.createdById !== actorId
  ) {
    return "You can only cancel blocks you created.";
  }
  return "You don't have permission to cancel this block.";
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
        "Only a Manager or Super Admin can release an active hold."
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

  await invalidateStockCaches();
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
};

/** Awaits promises one after another, so they never hold two connections. */
async function sequential<T extends readonly Promise<any>[]>(
  promises: T
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const out: any[] = [];
  for (const p of promises) out.push(await p);
  return out as any;
}

/** Resolves an audience list to a de-duplicated set of user ids. */
async function resolveAudience(block: NotifiableBlock, audiences: BlockAudience[]): Promise<string[]> {
  const ids = new Set<string>();

  const needsShowroom = audiences.includes("SHOWROOM") || audiences.includes("SHOWROOM_INCHARGE");
  const needsStaffRoles = audiences.includes("MANAGERS") || audiences.includes("SUPER_ADMINS");

  // Two queries at most, rather than one per audience. Sequential rather than
  // parallel: this runs after the stock transaction has committed, so latency
  // here costs nobody, while a second simultaneous connection can.
  const [showroomUsers, staffUsers] = await sequential([
    needsShowroom && block.showroomId
      ? db.user.findMany({
          where: { showroomId: block.showroomId, status: "ACTIVE" },
          select: { id: true, role: true },
        })
      : Promise.resolve([] as Array<{ id: string; role: string }>),
    needsStaffRoles
      ? db.user.findMany({
          where: {
            status: "ACTIVE",
            role: {
              in: [
                ...(audiences.includes("MANAGERS") ? (["MANAGER"] as const) : []),
                ...(audiences.includes("SUPER_ADMINS") ? (["SUPER_ADMIN"] as const) : []),
              ],
            },
          },
          select: { id: true, role: true },
        })
      : Promise.resolve([] as Array<{ id: string; role: string }>),
  ] as const);

  for (const audience of audiences) {
    if (audience === "CREATOR") {
      if (block.createdById) ids.add(block.createdById);
    } else if (audience === "SHOWROOM") {
      showroomUsers.forEach((u) => ids.add(u.id));
    } else if (audience === "SHOWROOM_INCHARGE") {
      showroomUsers.filter((u) => u.role === "SHOWROOM_INCHARGE").forEach((u) => ids.add(u.id));
    } else if (audience === "MANAGERS") {
      staffUsers.filter((u) => u.role === "MANAGER").forEach((u) => ids.add(u.id));
    } else if (audience === "SUPER_ADMINS") {
      staffUsers.filter((u) => u.role === "SUPER_ADMIN").forEach((u) => ids.add(u.id));
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

/**
 * The expiry worker.
 *
 * Runs from the cron route and from the in-process scheduler, so expiry does
 * not depend on anybody opening a page (spec §16).
 */
export async function releaseExpiredBlocks() {
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // 1. Warn about blocks expiring within two hours — once each. Previously
  // every cron tick re-notified the same block; the audit trail is used as the
  // idempotency record so no extra column is needed.
  const expiringSoon = await db.stockBlock.findMany({
    where: {
      status: { in: [...EXPIRABLE_BLOCK_STATUSES] },
      expiresAt: { gte: now, lte: twoHoursFromNow },
    },
    select: { id: true, block_number: true, createdById: true, showroomId: true },
  });

  let warningsSent = 0;
  if (expiringSoon.length > 0) {
    const alreadyWarned = await db.auditLog.findMany({
      where: {
        entity: "StockBlock",
        entityId: { in: expiringSoon.map((b) => b.id) },
        action: "EXPIRY_WARNING",
      },
      select: { entityId: true },
    });
    const warnedIds = new Set(alreadyWarned.map((a) => a.entityId));

    for (const block of expiringSoon) {
      if (warnedIds.has(block.id)) continue;
      await notifyBlockParties(block, {
        type: "BLOCK_EXPIRING",
        title: "Reservation Expiring Soon",
        message: `Block ${block.block_number} expires in less than 2 hours.`,
        priority: "HIGH",
        audiences: ["CREATOR", "SHOWROOM", "SUPER_ADMINS"],
      });
      await db.auditLog.create({
        data: {
          action: "EXPIRY_WARNING",
          entity: "StockBlock",
          entityId: block.id,
          roleAtTime: "SYSTEM",
          meta: { performedBy: "SYSTEM", reason: "Expiry warning sent" },
        },
      });
      warningsSent++;
    }
  }

  // 2. Expire blocks that have passed their expiry date. `expireBlock`
  // performs the release and the status change as one guarded transition.
  const expiredBlocks = await db.stockBlock.findMany({
    where: {
      status: { in: [...EXPIRABLE_BLOCK_STATUSES] },
      expiresAt: { lte: now },
    },
    select: { id: true, block_number: true, createdById: true, showroomId: true },
  });

  let releasedCount = 0;
  const failures: string[] = [];
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
    } catch (err: any) {
      // A block someone acted on between the query and the transaction is a
      // normal race, not a failure worth alarming about.
      failures.push(`${block.block_number}: ${err?.message ?? "unknown error"}`);
    }
  }

  if (releasedCount > 0) {
    await invalidateStockCaches();
  }

  if (failures.length > 0) {
    console.warn(`[EXPIRATION WORKER] ${failures.length} block(s) skipped:`, failures.join("; "));
  }

  return {
    found: expiredBlocks.length,
    released: releasedCount,
    warningsSent,
    skipped: failures.length,
  };
}

/**
 * Recomputes every inventory row's derived columns from the blocks that are
 * actually active. Repairs drift left by earlier code paths and is safe to run
 * at any time — it never invents physical stock, only re-derives the split.
 */
export async function reconcileInventory({ dryRun = false }: { dryRun?: boolean } = {}) {
  const inventories = await db.inventory.findMany({
    select: {
      id: true,
      productId: true,
      totalStock: true,
      availableStock: true,
      blockedStock: true,
      allocatedStock: true,
      damagedStock: true,
      transitStock: true,
      deliveredStock: true,
      // Without this the recomputed availability would ignore booking
      // reservations and hand the same boxes back to the blockable pool.
      reservedStock: true,
      reorderLevel: true,
      stockStatus: true,
    },
  });

  // One grouped query rather than one per product.
  const activeBlocks = await db.stockBlock.groupBy({
    by: ["inventoryId"],
    where: { status: { in: [...ACTIVE_BLOCK_STATUSES] } },
    _sum: { quantity: true, shippedQuantity: true },
  });
  const blockedByInventory = new Map(
    activeBlocks.map((row) => [
      row.inventoryId,
      Math.max(0, (row._sum.quantity ?? 0) - (row._sum.shippedQuantity ?? 0)),
    ])
  );

  const drifted: Array<{
    inventoryId: string;
    productId: string;
    was: number;
    now: number;
    wasAvailable: number;
    nowAvailable: number;
    wasStatus: string;
    nowStatus: string;
  }> = [];

  for (const inv of inventories) {
    const expectedBlocked = blockedByInventory.get(inv.id) ?? 0;
    const next = { ...inv, blockedStock: expectedBlocked };
    const expectedAvailable = availableFrom(next);
    const expectedStatus = deriveStockStatus(next);

    const needsFix =
      inv.blockedStock !== expectedBlocked ||
      inv.availableStock !== expectedAvailable ||
      inv.stockStatus !== expectedStatus;

    if (!needsFix) continue;

    drifted.push({
      inventoryId: inv.id,
      productId: inv.productId,
      was: inv.blockedStock,
      now: expectedBlocked,
      // Availability drifts independently of the blocked figure (a stale
      // reservation or allocation moves it), so report both.
      wasAvailable: inv.availableStock,
      nowAvailable: expectedAvailable,
      // A row can drift on the derived status alone; without this the report
      // showed identical numbers and looked like a false positive.
      wasStatus: inv.stockStatus,
      nowStatus: expectedStatus,
    });

    if (!dryRun) {
      await db.inventory.update({
        where: { id: inv.id },
        data: {
          blockedStock: expectedBlocked,
          availableStock: expectedAvailable,
          stockStatus: expectedStatus,
        },
      });
    }
  }

  if (drifted.length > 0 && !dryRun) await invalidateStockCaches();

  return { checked: inventories.length, repaired: drifted.length, details: drifted.slice(0, 50) };
}
