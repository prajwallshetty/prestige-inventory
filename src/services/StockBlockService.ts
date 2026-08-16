import { db } from "@/lib/db";
import { sendNotificationsToUsers } from "@/services/NotificationService";
import { invalidateCache } from "@/lib/redis";

// Helper to generate a unique block/booking number
function generateBlockNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `BLK-${year}-${rand}`;
}

export async function createBlockRequest({
  productId,
  quantity,
  dealerId,
  showroomId,
  remarks,
  durationHours = 48,
  requestedBy,
  blocked_by,
  blockType = "BLOCKED",
  approvalRoute = "DIRECT",
  userRole,
}: {
  productId: string;
  quantity: number;
  dealerId?: string;
  showroomId?: string;
  remarks?: string;
  durationHours?: number;
  requestedBy: string;
  blocked_by?: "SAMSHUDIN" | "SALMAN";
  blockType?: "BLOCKED" | "CONFIRMED";
  approvalRoute?: "DIRECT" | "INCHARGE";
  userRole?: string;
}) {
  const result = await db.$transaction(async (tx) => {
    // 1. Lock inventory record for concurrency safety
    const inventory = await tx.inventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      throw new Error("Inventory record not found for this product.");
    }

    // Recommended calculation: AVAILABLE STOCK = PHYSICAL (totalStock) - BLOCKED - ALLOCATED - DAMAGED
    const calculatedAvailable = inventory.totalStock - inventory.blockedStock - inventory.allocatedStock - inventory.damagedStock;

    if (calculatedAvailable < quantity) {
      throw new Error(
        `Insufficient available stock (Only ${calculatedAvailable} boxes are currently available, requested ${quantity}).`
      );
    }

    // Determine starting status based on Route and Creator Role
    let status = "PENDING_MANAGER_APPROVAL";
    if (userRole === "SHOWROOM_STAFF" && approvalRoute === "INCHARGE") {
      status = "PENDING_INCHARGE_APPROVAL";
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    // 2. Create the StockBlock record
    const block = await tx.stockBlock.create({
      data: {
        block_number: generateBlockNumber(),
        block_type: blockType,
        productId,
        inventoryId: inventory.id,
        warehouseId: inventory.warehouseId,
        dealerId: dealerId || null,
        showroomId: showroomId || null,
        quantity,
        requestedBy,
        blocked_by: blocked_by || null,
        status,
        remarks,
        approvalRoute,
        expiresAt,
      },
    });

    // 3. Update inventory balances immediately (A stock block is NOT a stock deduction of physical stock)
    // BLOCK decreases Available and increases Blocked, Physical remains unchanged
    const newAvailable = inventory.availableStock - quantity;
    const newBlocked = inventory.blockedStock + quantity;

    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        availableStock: Math.max(0, newAvailable),
        blockedStock: newBlocked,
        stockStatus: newAvailable <= 0 ? "BLOCKED" : inventory.stockStatus,
      },
    });

    // 4. Record Stock Movement
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId,
        warehouseId: inventory.warehouseId,
        movementType: "BLOCK_CREATED",
        quantity,
        previousQuantity: inventory.availableStock,
        newQuantity: Math.max(0, newAvailable),
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: remarks || "Dealer/Showroom Stock Block Requested",
        performedBy: requestedBy,
      },
    });

    // 5. Create Audit Log
    await tx.auditLog.create({
      data: {
        action: "CREATE_BLOCK",
        entity: "StockBlock",
        entityId: block.id,
        meta: {
          performedBy: requestedBy,
          blockNumber: block.block_number,
          quantity,
          status,
        },
      },
    });

    return block;
  });

  // Post-transaction Cache & Notifications
  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");

  if (userRole === "SHOWROOM_STAFF" && approvalRoute === "INCHARGE") {
    const inchargeUsers = await db.user.findMany({
      where: { role: "SHOWROOM_INCHARGE", showroomId },
      select: { id: true },
    });
    await sendNotificationsToUsers({
      userIds: inchargeUsers.map((u) => u.id),
      type: "BLOCK_CREATED",
      title: "Showroom Block Awaiting Review",
      message: `Staff ${requestedBy} requested a block of ${quantity} boxes.`,
      priority: "NORMAL",
      data: { blockId: result.id },
    });
  } else {
    const targetUsers = await db.user.findMany({
      where: {
        OR: [{ role: "SUPER_ADMIN" }, { role: "MANAGER" }],
      },
      select: { id: true },
    });
    await sendNotificationsToUsers({
      userIds: targetUsers.map((u) => u.id),
      type: "BLOCK_CREATED",
      title: "New Block Hold Request",
      message: `A block hold of ${quantity} boxes has been submitted for approval.`,
      priority: "NORMAL",
      data: { blockId: result.id },
    });
  }

  return result;
}

export async function approveBlock({
  blockId,
  approvedBy,
  role,
  approvedQuantity,
}: {
  blockId: string;
  approvedBy: string;
  role: string;
  approvedQuantity?: number;
}) {
  const result = await db.$transaction(async (tx) => {
    const block = await tx.stockBlock.findUnique({
      where: { id: blockId },
      include: { inventory: true },
    });

    if (!block) throw new Error("Stock block request not found.");

    // Route B: SHOWROOM_INCHARGE approval
    if (block.status === "PENDING_INCHARGE_APPROVAL") {
      if (role !== "SHOWROOM_INCHARGE" && role !== "SUPER_ADMIN") {
        throw new Error("Only Showroom In-Charge can approve showroom staff blocks at this stage.");
      }

      // Update status to PENDING_MANAGER_APPROVAL
      const updatedBlock = await tx.stockBlock.update({
        where: { id: blockId },
        data: {
          status: "PENDING_MANAGER_APPROVAL",
          approvedBy,
          approvedAt: new Date(),
        },
      });

      // Notify Manager ONLY (do NOT notify Super Admin)
      const managers = await tx.user.findMany({
        where: { role: "MANAGER", warehouse_id: block.warehouseId },
        select: { id: true }
      });
      for (const u of managers) {
        await tx.notification.create({
          data: {
            userId: u.id,
            type: "BLOCK_APPROVED",
            title: "Showroom Approved Block Review",
            message: `Showroom In-Charge approved block #${block.block_number || block.id.slice(-8)}. Final approval required.`,
            priority: "NORMAL",
            data: { blockId: block.id }
          }
        });
      }

      await tx.auditLog.create({
        data: {
          action: "INCHARGE_APPROVE_BLOCK",
          entity: "StockBlock",
          entityId: block.id,
          meta: { performedBy: approvedBy, details: "Approved by Showroom In-Charge. Routed to Manager." },
        },
      });

      return { updatedBlock, isStageOne: true };
    }

    // Route A, B, C: Final MANAGER or SUPER_ADMIN approval
    if (block.status !== "PENDING_MANAGER_APPROVAL") {
      throw new Error(`Block request is not in PENDING_MANAGER_APPROVAL state (Current: ${block.status}).`);
    }

    if (role !== "MANAGER" && role !== "SUPER_ADMIN") {
      throw new Error("Only Manager or Super Admin can perform final block approval.");
    }

    const inventory = block.inventory;
    const finalQty = approvedQuantity !== undefined ? approvedQuantity : block.quantity;

    if (finalQty < 0) {
      throw new Error("Approved quantity cannot be negative.");
    }

    let updatedBlock = block;

    // Handle Partial Approval (reducing quantity and releasing the remainder)
    if (finalQty < block.quantity) {
      const difference = block.quantity - finalQty;

      // Update inventory: return difference to available, subtract from blocked
      const newAvailable = inventory.availableStock + difference;
      const newBlocked = Math.max(0, inventory.blockedStock - difference);

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          availableStock: newAvailable,
          blockedStock: newBlocked,
          stockStatus: newAvailable > 0 ? "AVAILABLE" : inventory.stockStatus,
        },
      });

      // Record partial release movement
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          productId: block.productId,
          warehouseId: block.warehouseId,
          movementType: "BLOCK_RELEASED",
          quantity: difference,
          previousQuantity: inventory.availableStock,
          newQuantity: newAvailable,
          referenceType: "BLOCK",
          referenceId: block.id,
          reason: `Partial Block Approval. Released remainder of ${difference} boxes.`,
          performedBy: approvedBy,
        },
      });

      // Update block record quantity
      updatedBlock = await tx.stockBlock.update({
        where: { id: blockId },
        data: {
          quantity: finalQty,
          remarks: `${block.remarks || ""} (Partial Approval: original requested ${block.quantity}, approved ${finalQty})`,
        },
        include: { inventory: true },
      });
    }

    // Determine next status based on Block Type
    // If block type is CONFIRMED, transition directly to CONFIRMED.
    // If block type is BLOCKED, transition to APPROVED.
    const targetStatus = block.block_type === "CONFIRMED" ? "CONFIRMED" : "APPROVED";

    updatedBlock = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: targetStatus,
        approvedBy,
        approvedAt: new Date(),
        // If confirmed, update confirmedAt as well
        confirmedAt: targetStatus === "CONFIRMED" ? new Date() : null,
      },
      include: { inventory: true },
    });

    // If target is CONFIRMED, shift stock from blocked to allocated
    if (targetStatus === "CONFIRMED") {
      const updatedInv = await tx.inventory.findUnique({ where: { id: inventory.id } });
      if (updatedInv) {
        await tx.inventory.update({
          where: { id: updatedInv.id },
          data: {
            blockedStock: Math.max(0, updatedInv.blockedStock - finalQty),
            allocatedStock: updatedInv.allocatedStock + finalQty,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            inventoryId: updatedInv.id,
            productId: block.productId,
            warehouseId: block.warehouseId,
            movementType: "ALLOCATED",
            quantity: finalQty,
            previousQuantity: updatedInv.allocatedStock,
            newQuantity: updatedInv.allocatedStock + finalQty,
            referenceType: "BLOCK",
            referenceId: block.id,
            reason: "Auto-allocated during Confirmed Block type approval",
            performedBy: approvedBy,
          },
        });
      }
    }

    // Notify Dealer and requesting Staff
    const notifyUsers: string[] = [];
    if (block.dealerId) {
      const dealers = await tx.user.findMany({ where: { dealer_id: block.dealerId }, select: { id: true } });
      dealers.forEach((d) => notifyUsers.push(d.id));
    }
    if (block.showroomId) {
      const staff = await tx.user.findMany({ where: { showroomId: block.showroomId }, select: { id: true } });
      staff.forEach((s) => notifyUsers.push(s.id));
    }
    // Also add explicit requester by name lookup if no IDs match
    if (notifyUsers.length === 0) {
      const requester = await tx.user.findFirst({ where: { name: block.requestedBy }, select: { id: true } });
      if (requester) notifyUsers.push(requester.id);
    }

    await tx.auditLog.create({
      data: {
        action: "APPROVE_BLOCK",
        entity: "StockBlock",
        entityId: block.id,
        meta: {
          performedBy: approvedBy,
          approvedQty: finalQty,
          originalQty: block.quantity,
          status: targetStatus,
        },
      },
    });

    return { updatedBlock, notifyUsers, finalQty, isStageOne: false };
  });

  if (result.isStageOne) {
    const managers = await db.user.findMany({
      where: { role: "MANAGER", warehouse_id: result.updatedBlock.warehouseId },
      select: { id: true }
    });
    await sendNotificationsToUsers({
      userIds: managers.map(u => u.id),
      type: "BLOCK_APPROVED",
      title: "Showroom Approved Block Review",
      message: `Showroom In-Charge approved block #${result.updatedBlock.block_number || result.updatedBlock.id.slice(-8)}. Final approval required.`,
      priority: "NORMAL",
      data: { blockId: result.updatedBlock.id }
    });
  } else if (result.notifyUsers && result.notifyUsers.length > 0) {
    await sendNotificationsToUsers({
      userIds: result.notifyUsers,
      type: "BLOCK_APPROVED",
      title: "Stock Block Approved",
      message: `Your request for ${result.finalQty} boxes has been approved.`,
      priority: "NORMAL",
      data: { blockId: blockId }
    });
  }

  await invalidateCache("inventory:*");
  await invalidateCache("dashboard:*");

  return result.updatedBlock;
}

export async function rejectBlock({
  blockId,
  rejectedBy,
  role,
  reason,
}: {
  blockId: string;
  rejectedBy: string;
  role: string;
  reason?: string;
}) {
  return await db.$transaction(async (tx) => {
    const block = await tx.stockBlock.findUnique({
      where: { id: blockId },
      include: { inventory: true },
    });

    if (!block) throw new Error("Stock block request not found.");

    // Validate authorization
    if (block.status === "PENDING_INCHARGE_APPROVAL") {
      if (role !== "SHOWROOM_INCHARGE" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        throw new Error("Unauthorized to reject at this showroom stage.");
      }
    } else if (block.status === "PENDING_MANAGER_APPROVAL") {
      if (role !== "MANAGER" && role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized to reject at this manager stage.");
      }
    } else {
      throw new Error(`Cannot reject block in current status: ${block.status}`);
    }

    // Release stock holds back to available
    const inventory = block.inventory;
    const newAvailable = inventory.availableStock + block.quantity;
    const newBlocked = Math.max(0, inventory.blockedStock - block.quantity);

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
        status: "REJECTED",
        remarks: reason ? `${block.remarks || ""} [Rejection Reason: ${reason}]` : block.remarks,
      },
    });

    // Notify requesting user of Rejection
    const rejectUsers: string[] = [];
    if (block.dealerId) {
      const dlrs = await tx.user.findMany({ where: { dealer_id: block.dealerId }, select: { id: true } });
      dlrs.forEach((d) => rejectUsers.push(d.id));
    }
    if (block.showroomId) {
      const stff = await tx.user.findMany({ where: { showroomId: block.showroomId }, select: { id: true } });
      stff.forEach((s) => rejectUsers.push(s.id));
    }
    if (rejectUsers.length === 0) {
      const req = await tx.user.findFirst({ where: { name: block.requestedBy }, select: { id: true } });
      if (req) rejectUsers.push(req.id);
    }

    for (const uid of rejectUsers) {
      await tx.notification.create({
        data: {
          userId: uid,
          type: "BLOCK_REJECTED",
          title: "Stock Block Rejected",
          message: `Your request was rejected. ${reason ? `Reason: ${reason}` : ""}`,
          priority: "HIGH",
          data: { blockId: block.id }
        }
      });
    }

    // Log release movement
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: block.productId,
        warehouseId: block.warehouseId,
        movementType: "BLOCK_RELEASED",
        quantity: block.quantity,
        previousQuantity: inventory.availableStock,
        newQuantity: newAvailable,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: reason || "Stock Block Request Rejected",
        performedBy: rejectedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "REJECT_BLOCK",
        entity: "StockBlock",
        entityId: block.id,
        meta: { performedBy: rejectedBy, reason },
      },
    });

    return updatedBlock;
  });
}

export async function confirmBlock({
  blockId,
  confirmedBy,
}: {
  blockId: string;
  confirmedBy: string;
}) {
  return await db.$transaction(async (tx) => {
    const block = await tx.stockBlock.findUnique({
      where: { id: blockId },
      include: { inventory: true },
    });

    if (!block) throw new Error("Stock block not found.");
    if (block.status !== "APPROVED") {
      throw new Error(`Only APPROVED blocks can be confirmed. Current: ${block.status}`);
    }

    const inventory = block.inventory;

    // Shift stock from Blocked to Allocated/Confirmed
    const newBlocked = Math.max(0, inventory.blockedStock - block.quantity);
    const newAllocated = inventory.allocatedStock + block.quantity;

    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        blockedStock: newBlocked,
        allocatedStock: newAllocated,
      },
    });

    const updatedBlock = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        expiresAt: null, // confirmation removes expiration deadline
      },
    });

    // Notify Managers & Super Admins of confirmation
    const opsUsers = await tx.user.findMany({
      where: {
        OR: [
          { role: "SUPER_ADMIN" },
          { role: "MANAGER", warehouse_id: block.warehouseId }
        ]
      },
      select: { id: true }
    });
    for (const u of opsUsers) {
      await tx.notification.create({
        data: {
          userId: u.id,
          type: "BOOKING_CONFIRMED",
          title: "Booking Confirmed by Dealer",
          message: `Dealer confirmed booking #${block.block_number || block.id.slice(-8)}.`,
          priority: "NORMAL",
          data: { blockId: block.id }
        }
      });
    }

    // Record stock allocation movement
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: block.productId,
        warehouseId: block.warehouseId,
        movementType: "ALLOCATED",
        quantity: block.quantity,
        previousQuantity: inventory.allocatedStock,
        newQuantity: newAllocated,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: "Stock allocated/confirmed by dealer",
        performedBy: confirmedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CONFIRM_BLOCK",
        entity: "StockBlock",
        entityId: block.id,
        meta: { performedBy: confirmedBy },
      },
    });

    return updatedBlock;
  });
}

export async function deliverBlock({
  blockId,
  deliveryQty,
  deliveredBy,
}: {
  blockId: string;
  deliveryQty: number;
  deliveredBy: string;
}) {
  return await db.$transaction(async (tx) => {
    const block = await tx.stockBlock.findUnique({
      where: { id: blockId },
      include: { inventory: true },
    });

    if (!block) throw new Error("Stock block not found.");
    
    const allowedFulfillStates = ["CONFIRMED", "PARTIALLY_FULFILLED"];
    if (!allowedFulfillStates.includes(block.status)) {
      throw new Error(`Stock can only be dispatched from CONFIRMED or PARTIALLY_FULFILLED blocks. Current status: ${block.status}`);
    }

    const inventory = block.inventory;

    if (deliveryQty <= 0) {
      throw new Error("Dispatch quantity must be greater than zero.");
    }

    // Check if deliveryQty exceeds current allocated reserve
    if (deliveryQty > inventory.allocatedStock) {
      throw new Error(`Requested dispatch quantity ${deliveryQty} exceeds warehouse allocated stock reserve of ${inventory.allocatedStock}.`);
    }

    // Deduct physical (totalStock) and allocated stock, increment delivered stock
    const newTotal = Math.max(0, inventory.totalStock - deliveryQty);
    const newAllocated = Math.max(0, inventory.allocatedStock - deliveryQty);
    const newDelivered = inventory.deliveredStock + deliveryQty;

    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        totalStock: newTotal,
        allocatedStock: newAllocated,
        deliveredStock: newDelivered,
        stockStatus: newTotal <= 0 ? "OUT_OF_STOCK" : inventory.stockStatus,
      },
    });

    // Determine new status (e.g. FULFILLED if all or remaining was delivered, else PARTIALLY_FULFILLED)
    // We can compare against block quantity if we want, or if remaining allocated goes to zero.
    // For partial dispatch, let's update status:
    const remainingToDeliver = block.quantity - (block.deliveredAt ? block.quantity : 0); // basic fallback, or we can check newAllocated.
    const isFullyDelivered = newAllocated === 0;
    const newStatus = isFullyDelivered ? "DELIVERED" : "PARTIALLY_FULFILLED";

    const updatedBlock = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: newStatus,
        deliveredAt: new Date(),
        remarks: `${block.remarks || ""} (Dispatched ${deliveryQty} boxes by ${deliveredBy})`,
      },
    });

    // Notify Dealer/Staff of Delivery/Dispatch
    const delivUsers: string[] = [];
    if (block.dealerId) {
      const dlrs = await tx.user.findMany({ where: { dealer_id: block.dealerId }, select: { id: true } });
      dlrs.forEach((d) => delivUsers.push(d.id));
    }
    if (block.showroomId) {
      const stff = await tx.user.findMany({ where: { showroomId: block.showroomId }, select: { id: true } });
      stff.forEach((s) => delivUsers.push(s.id));
    }
    if (delivUsers.length === 0) {
      const req = await tx.user.findFirst({ where: { name: block.requestedBy }, select: { id: true } });
      if (req) delivUsers.push(req.id);
    }

    for (const uid of delivUsers) {
      await tx.notification.create({
        data: {
          userId: uid,
          type: "BOOKING_DELIVERED",
          title: "Your Order has been Dispatched",
          message: `Warehouse has dispatched ${deliveryQty} boxes from booking #${block.block_number || block.id.slice(-8)}.`,
          priority: "HIGH",
          data: { blockId: block.id }
        }
      });
    }

    // Record STOCK_DISPATCHED or STOCK_DELIVERED movement
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: block.productId,
        warehouseId: block.warehouseId,
        movementType: "STOCK_DISPATCHED",
        quantity: deliveryQty,
        previousQuantity: inventory.totalStock,
        newQuantity: newTotal,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: `Dispatched ${deliveryQty} boxes to dealer`,
        performedBy: deliveredBy,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "DISPATCH_STOCK",
        entity: "StockBlock",
        entityId: block.id,
        meta: {
          performedBy: deliveredBy,
          dispatchedQty: deliveryQty,
          newPhysicalStock: newTotal,
        },
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

    const inventory = block.inventory;
    let newAvailable = inventory.availableStock;
    let newBlocked = inventory.blockedStock;
    let newAllocated = inventory.allocatedStock;

    if (block.status === "PENDING" || block.status === "APPROVED" || block.status === "PENDING_INCHARGE_APPROVAL" || block.status === "PENDING_MANAGER_APPROVAL") {
      // Stock was in blockedStock
      newAvailable = inventory.availableStock + block.quantity;
      newBlocked = Math.max(0, inventory.blockedStock - block.quantity);
    } else if (block.status === "CONFIRMED" || block.status === "PARTIALLY_FULFILLED") {
      // Stock was in allocatedStock
      newAvailable = inventory.availableStock + block.quantity;
      newAllocated = Math.max(0, inventory.allocatedStock - block.quantity);
    } else {
      throw new Error(`Only pending, approved, or confirmed blocks can be released (Current status: ${block.status}).`);
    }

    // Update inventory
    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        availableStock: newAvailable,
        blockedStock: newBlocked,
        allocatedStock: newAllocated,
        stockStatus: newAvailable > 0 ? "AVAILABLE" : inventory.stockStatus,
      },
    });

    // Update block status
    const updatedBlock = await tx.stockBlock.update({
      where: { id: blockId },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        remarks: reason ? `${block.remarks || ""} [Released: ${reason}]` : block.remarks,
      },
    });

    // Notify Requesting User of Release
    const relUsers: string[] = [];
    if (block.dealerId) {
      const dlrs = await tx.user.findMany({ where: { dealer_id: block.dealerId }, select: { id: true } });
      dlrs.forEach((d) => relUsers.push(d.id));
    }
    if (block.showroomId) {
      const stff = await tx.user.findMany({ where: { showroomId: block.showroomId }, select: { id: true } });
      stff.forEach((s) => relUsers.push(s.id));
    }
    if (relUsers.length === 0) {
      const req = await tx.user.findFirst({ where: { name: block.requestedBy }, select: { id: true } });
      if (req) relUsers.push(req.id);
    }

    for (const uid of relUsers) {
      await tx.notification.create({
        data: {
          userId: uid,
          type: "BOOKING_RELEASED",
          title: "Stock Reservation Released",
          message: `Your reservation has been released. ${reason ? `Note: ${reason}` : ""}`,
          priority: "NORMAL",
          data: { blockId: block.id }
        }
      });
    }

    // Movement Log
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: block.productId,
        warehouseId: block.warehouseId,
        movementType: "BLOCK_RELEASED",
        quantity: block.quantity,
        previousQuantity: inventory.availableStock,
        newQuantity: newAvailable,
        referenceType: "BLOCK",
        referenceId: block.id,
        reason: reason || "Stock Block Released manually",
        performedBy: releasedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "RELEASE_BLOCK",
        entity: "StockBlock",
        entityId: block.id,
        meta: { performedBy: releasedBy, reason },
      },
    });

    return updatedBlock;
  });
}

export async function releaseExpiredBlocks() {
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // 1. Send warning notifications for blocks expiring in the next 2 hours
  const expiringSoon = await db.stockBlock.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING", "PENDING_INCHARGE_APPROVAL", "PENDING_MANAGER_APPROVAL"] },
      expiresAt: { gte: now, lte: twoHoursFromNow },
    },
  });

  for (const block of expiringSoon) {
    const notifyUsers: string[] = [];
    if (block.dealerId) {
      const dlrs = await db.user.findMany({ where: { dealer_id: block.dealerId }, select: { id: true } });
      dlrs.forEach((d) => notifyUsers.push(d.id));
    }
    if (block.showroomId) {
      const stff = await db.user.findMany({ where: { showroomId: block.showroomId }, select: { id: true } });
      stff.forEach((s) => notifyUsers.push(s.id));
    }
    if (notifyUsers.length === 0) {
      const req = await db.user.findFirst({ where: { name: block.requestedBy }, select: { id: true } });
      if (req) notifyUsers.push(req.id);
    }

    await sendNotificationsToUsers({
      userIds: notifyUsers,
      type: "BLOCK_EXPIRING",
      title: "Reservation Expiring Soon",
      message: `Your reservation for ${block.quantity} boxes expires in less than 2 hours.`,
      priority: "HIGH",
      data: { blockId: block.id },
    });
  }

  // 2. Release blocks that have passed their expiry date
  const expiredBlocks = await db.stockBlock.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING", "PENDING_INCHARGE_APPROVAL", "PENDING_MANAGER_APPROVAL"] },
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

      const notifyUsers: string[] = [];
      if (block.dealerId) {
        const dlrs = await db.user.findMany({ where: { dealer_id: block.dealerId }, select: { id: true } });
        dlrs.forEach((d) => notifyUsers.push(d.id));
      }
      if (block.showroomId) {
        const stff = await db.user.findMany({ where: { showroomId: block.showroomId }, select: { id: true } });
        stff.forEach((s) => notifyUsers.push(s.id));
      }

      await sendNotificationsToUsers({
        userIds: notifyUsers,
        type: "BOOKING_EXPIRED",
        title: "Reservation Expired",
        message: `Your reservation for ${block.quantity} boxes has expired and the stock has been released.`,
        priority: "HIGH",
        data: { blockId: block.id },
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
