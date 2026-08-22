import { db, STOCK_TX_OPTIONS } from "../lib/db";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Locks an inventory row for the rest of the transaction and returns its
 * post-lock values.
 *
 * Every stock write below used to read `item.product.inventory` — a snapshot
 * loaded before the transaction — and then write absolute values back. A block
 * mutation committing in between was silently overwritten (a classic lost
 * update). Mirrors the locking StockBlockService uses so the two modules
 * serialise against each other on the same row.
 */
async function lockInventory(tx: any, inventoryId: string) {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT id, "totalStock", "availableStock", "blockedStock", "allocatedStock",
            "reservedStock", "damagedStock", "transitStock"
       FROM "Inventory" WHERE id = $1 FOR UPDATE`,
    inventoryId
  )) as Array<{
    id: string;
    totalStock: number;
    availableStock: number;
    blockedStock: number;
    allocatedStock: number;
    reservedStock: number;
    damagedStock: number;
    transitStock: number;
  }>;
  return rows[0] ?? null;
}

/** available = physical − blocked − allocated − damaged − reserved (spec §6). */
function availableFrom(inv: {
  totalStock: number;
  blockedStock: number;
  allocatedStock: number;
  damagedStock: number;
  reservedStock: number;
}): number {
  return Math.max(
    0,
    inv.totalStock - inv.blockedStock - inv.allocatedStock - inv.damagedStock - inv.reservedStock
  );
}

export interface CreateBookingInput {
  dealerId: string;
  warehouseId: string;
  requestedBy: string;
  notes?: string;
  priority?: "NORMAL" | "HIGH" | "URGENT";
  isWaitlist?: boolean;
  items: Array<{
    productId: string;
    requestedQuantity: number;
    remarks?: string;
  }>;
}

// Helper to generate a unique booking number e.g. PRE-2026-104829
function generateBookingNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PRE-${year}-${rand}`;
}

export async function createBooking(input: CreateBookingInput) {
  if (input.items.length === 0) {
    throw new Error("A booking request must contain at least one product.");
  }

  return await db.$transaction(async (tx) => {
    const bookingNumber = generateBookingNumber();

    // 1. If isWaitlist is false, check if we have enough stock for all items
    // (If isWaitlist is true, we create it as ON_HOLD/Waitlisted without reserving stock)
    let initialStatus = "PENDING_APPROVAL";
    if (input.isWaitlist) {
      initialStatus = "ON_HOLD"; // Used for waitlist
    }

    const booking = await tx.stockBooking.create({
      data: {
        bookingNumber,
        dealerId: input.dealerId,
        warehouseId: input.warehouseId,
        status: initialStatus,
        requestedBy: input.requestedBy,
        notes: input.notes,
        priority: input.priority || "NORMAL",
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            requestedQuantity: item.requestedQuantity,
            remarks: item.remarks,
            approvedQuantity: 0,
            reservedQuantity: 0,
            allocatedQuantity: 0,
            fulfilledQuantity: 0,
            cancelledQuantity: 0,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        dealer: true,
        warehouse: true,
      },
    });

    // Record audit log for booking submission
    await tx.auditLog.create({
      data: {
        action: "SUBMIT_BOOKING",
        entity: "StockBooking",
        entityId: booking.id,
        meta: {
          performedBy: input.requestedBy,
          details: `Booking ${bookingNumber} submitted. Status: ${initialStatus}. Priority: ${booking.priority}`,
        },
      },
    });

    return booking;
  }, STOCK_TX_OPTIONS);
}

export async function reviewBooking({
  bookingId,
  status, // APPROVED | REJECTED | ON_HOLD
  approvedBy,
  itemApprovals, // Optional overrides for partial approval [{ itemId, approvedQuantity }]
  notes,
}: {
  bookingId: string;
  status: "APPROVED" | "REJECTED" | "ON_HOLD";
  approvedBy: string;
  itemApprovals?: Array<{ itemId: string; approvedQuantity: number }>;
  notes?: string;
}) {
  return await db.$transaction(async (tx) => {
    const booking = await tx.stockBooking.findUnique({
      where: { id: bookingId },
      include: {
        items: {
          include: {
            product: {
              include: { inventory: true },
            },
          },
        },
        warehouse: true,
        dealer: true,
      },
    });

    if (!booking) throw new Error("Booking request not found.");
    if (booking.status !== "PENDING_APPROVAL" && booking.status !== "ON_HOLD") {
      throw new Error(`Booking cannot be reviewed in current status: ${booking.status}`);
    }

    if (status === "REJECTED") {
      const updated = await tx.stockBooking.update({
        where: { id: bookingId },
        data: {
          status: "REJECTED",
          approvedBy,
          approvedAt: new Date(),
          notes: notes ? `${booking.notes || ""} [Review Note: ${notes}]` : booking.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "REJECT_BOOKING",
          entity: "StockBooking",
          entityId: bookingId,
          meta: {
            performedBy: approvedBy,
            details: `Booking ${booking.bookingNumber} rejected by ${approvedBy}. Note: ${notes || "N/A"}`,
          },
        },
      });

      return updated;
    }

    if (status === "ON_HOLD") {
      const updated = await tx.stockBooking.update({
        where: { id: bookingId },
        data: {
          status: "ON_HOLD",
          notes: notes ? `${booking.notes || ""} [Hold Note: ${notes}]` : booking.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "HOLD_BOOKING",
          entity: "StockBooking",
          entityId: bookingId,
          meta: {
            performedBy: approvedBy,
            details: `Booking ${booking.bookingNumber} placed on hold. Note: ${notes || "N/A"}`,
          },
        },
      });

      return updated;
    }

    // Status is APPROVED: we must reserve the stock
    // 1. Process item approvals and check availability concurrently
    const finalApprovals: { [itemId: string]: number } = {};
    for (const item of booking.items) {
      const override = itemApprovals?.find((a) => a.itemId === item.id);
      const approvedQty = override !== undefined ? override.approvedQuantity : item.requestedQuantity;
      
      if (approvedQty < 0) {
        throw new Error("Approved quantity cannot be negative.");
      }
      finalApprovals[item.id] = approvedQty;
    }

    let isPartialApproval = false;

    // 2. Lock and update inventory rows atomically
    for (const item of booking.items) {
      const approvedQty = finalApprovals[item.id];
      if (approvedQty === 0) continue;

      if (approvedQty < item.requestedQuantity) {
        isPartialApproval = true;
      }

      const inv = item.product.inventory;
      if (!inv) {
        throw new Error(`Inventory record not found for product ${item.product.name}`);
      }

      // Check available stock using conditional update to protect against concurrent modifications
      const updatedCount = await tx.inventory.updateMany({
        where: {
          id: inv.id,
          availableStock: { gte: approvedQty },
        },
        data: {
          availableStock: { decrement: approvedQty },
          reservedStock: { increment: approvedQty },
        },
      });

      if (updatedCount.count === 0) {
        // Refetch inventory to show correct available stock to user
        const currentInv = await tx.inventory.findUnique({ where: { id: inv.id } });
        throw new Error(
          `Insufficient stock for product ${item.product.name} (${currentInv?.availableStock || 0} available, trying to approve ${approvedQty}).`
        );
      }

      // Record Stock Movement
      const prevAvailable = inv.availableStock;
      const newAvailable = prevAvailable - approvedQty;
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inv.id,
          productId: item.productId,
          warehouseId: booking.warehouseId,
          movementType: "BLOCKED",
          quantity: approvedQty,
          previousQuantity: prevAvailable,
          newQuantity: newAvailable,
          referenceType: "BOOKING",
          referenceId: booking.id,
          reason: `Stock Reserved for Booking ${booking.bookingNumber}`,
          performedBy: approvedBy,
        },
      });

      // Update booking item numbers
      await tx.stockBookingItem.update({
        where: { id: item.id },
        data: {
          approvedQuantity: approvedQty,
          reservedQuantity: approvedQty,
        },
      });
    }

    // Set 24 hour expiry for confirmation
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const finalStatus = isPartialApproval ? "APPROVED" : "APPROVED"; // We display awaiting confirmation but store status as APPROVED or transitions to AWAITING_DEALER_CONFIRMATION
    // Let's set the status to AWAITING_DEALER_CONFIRMATION as required by the state machine
    const updatedBooking = await tx.stockBooking.update({
      where: { id: bookingId },
      data: {
        status: "AWAITING_DEALER_CONFIRMATION",
        approvedBy,
        approvedAt: new Date(),
        expiresAt,
        notes: notes ? `${booking.notes || ""} [Approval Note: ${notes}]` : booking.notes,
      },
      include: {
        items: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "APPROVE_BOOKING",
        entity: "StockBooking",
        entityId: bookingId,
        meta: {
          performedBy: approvedBy,
          details: `Booking ${booking.bookingNumber} approved. Expiry set to ${expiresAt.toLocaleString()}`,
        },
      },
    });

    return updatedBooking;
  }, STOCK_TX_OPTIONS);
}

export async function confirmBooking({
  bookingId,
  confirmedBy,
}: {
  bookingId: string;
  confirmedBy: string;
}) {
  return await db.$transaction(async (tx) => {
    const booking = await tx.stockBooking.findUnique({
      where: { id: bookingId },
      include: { items: true },
    });

    if (!booking) throw new Error("Booking not found.");
    if (booking.status !== "AWAITING_DEALER_CONFIRMATION") {
      throw new Error(`Only bookings awaiting dealer confirmation can be confirmed. Current status: ${booking.status}`);
    }

    const updated = await tx.stockBooking.update({
      where: { id: bookingId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        expiresAt: null, // Remove expiration timer on confirmation
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CONFIRM_BOOKING",
        entity: "StockBooking",
        entityId: bookingId,
        meta: {
          performedBy: confirmedBy,
          details: `Booking ${booking.bookingNumber} confirmed by dealer. Expiry removed.`,
        },
      },
    });

    return updated;
  }, STOCK_TX_OPTIONS);
}

export async function requestBookingExtension({
  bookingId,
  extensionHours = 24,
  reason,
  requestedBy,
}: {
  bookingId: string;
  extensionHours?: number;
  reason: string;
  requestedBy: string;
}) {
  return await db.stockBooking.update({
    where: { id: bookingId },
    data: {
      extensionRequested: true,
      extensionHours,
      extensionReason: reason,
      notes: `${reason} (Requested Extension by ${requestedBy})`,
    },
  });
}

export async function reviewExtension({
  bookingId,
  action, // APPROVE | REJECT
  performedBy,
}: {
  bookingId: string;
  action: "APPROVE" | "REJECT";
  performedBy: string;
}) {
  return await db.$transaction(async (tx) => {
    const booking = await tx.stockBooking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new Error("Booking not found.");
    if (!booking.extensionRequested || !booking.expiresAt) {
      throw new Error("No extension request active on this booking.");
    }

    let updatedExpiresAt = booking.expiresAt;
    let notes = booking.notes;

    if (action === "APPROVE") {
      const hoursToAdd = booking.extensionHours || 24;
      updatedExpiresAt = new Date(booking.expiresAt.getTime() + hoursToAdd * 60 * 60 * 1000);
      notes = `${booking.notes || ""} [Extension Approved by ${performedBy}: +${hoursToAdd}h]`;
    } else {
      notes = `${booking.notes || ""} [Extension Rejected by ${performedBy}]`;
    }

    const updated = await tx.stockBooking.update({
      where: { id: bookingId },
      data: {
        expiresAt: updatedExpiresAt,
        extensionRequested: false,
        extensionHours: null,
        extensionReason: null,
        notes,
      },
    });

    await tx.auditLog.create({
      data: {
        action: action === "APPROVE" ? "APPROVE_EXTENSION" : "REJECT_EXTENSION",
        entity: "StockBooking",
        entityId: bookingId,
        meta: {
          performedBy,
          details: action === "APPROVE" ? `Extension approved. New expiry: ${updatedExpiresAt.toLocaleString()}` : `Extension request rejected.`,
        },
      },
    });

    return updated;
  }, STOCK_TX_OPTIONS);
}

export async function cancelBooking({
  bookingId,
  cancelledBy,
  reason,
}: {
  bookingId: string;
  cancelledBy: string;
  reason: string;
}) {
  return await db.$transaction(async (tx) => {
    const booking = await tx.stockBooking.findUnique({
      where: { id: bookingId },
      include: {
        items: {
          include: {
            product: { include: { inventory: true } },
          },
        },
      },
    });

    if (!booking) throw new Error("Booking not found.");

    const allowedCancelStates = ["PENDING_APPROVAL", "ON_HOLD", "AWAITING_DEALER_CONFIRMATION", "CONFIRMED"];
    if (!allowedCancelStates.includes(booking.status)) {
      throw new Error(`Booking cannot be cancelled in current status: ${booking.status}`);
    }

    // If booking was approved (meaning stock is reserved), we must release the stock back to availableStock
    const needsStockRelease = booking.status === "AWAITING_DEALER_CONFIRMATION" || booking.status === "CONFIRMED";

    if (needsStockRelease) {
      for (const item of booking.items) {
        const reservedQty = item.reservedQuantity;
        if (reservedQty <= 0) continue;

        const snapshot = item.product.inventory;
        const inv = snapshot ? await lockInventory(tx, snapshot.id) : null;
        if (inv) {
          // Approval reserves into reservedStock, so cancellation must release
          // from reservedStock. Decrementing blockedStock instead handed back
          // stock held by an unrelated *block* and left this booking's
          // reservation stranded for good.
          const prevAvailable = inv.availableStock;
          const newReserved = Math.max(0, inv.reservedStock - reservedQty);
          const newAvailable = availableFrom({ ...inv, reservedStock: newReserved });

          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              reservedStock: newReserved,
              availableStock: newAvailable,
            },
          });

          // Stock Movement Log
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              productId: item.productId,
              warehouseId: booking.warehouseId,
              movementType: "BLOCK_RELEASED",
              quantity: reservedQty,
              previousQuantity: prevAvailable,
              newQuantity: newAvailable,
              referenceType: "BOOKING",
              referenceId: booking.id,
              reason: `Booking ${booking.bookingNumber} Cancelled. Stock Released.`,
              performedBy: cancelledBy,
            },
          });
        }

        await tx.stockBookingItem.update({
          where: { id: item.id },
          data: {
            reservedQuantity: 0,
            cancelledQuantity: reservedQty,
          },
        });
      }
    }

    const updated = await tx.stockBooking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        expiresAt: null,
        notes: `${booking.notes || ""} [Cancellation: ${reason} by ${cancelledBy}]`,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CANCEL_BOOKING",
        entity: "StockBooking",
        entityId: bookingId,
        meta: {
          performedBy: cancelledBy,
          details: `Booking ${booking.bookingNumber} cancelled. Reason: ${reason}`,
        },
      },
    });

    return updated;
  }, STOCK_TX_OPTIONS);
}

export async function releaseExpiredBookings() {
  const now = new Date();
  const expiredBookings = await db.stockBooking.findMany({
    where: {
      status: "AWAITING_DEALER_CONFIRMATION",
      expiresAt: { lte: now },
    },
    include: {
      items: {
        include: {
          product: { include: { inventory: true } },
        },
      },
    },
  });

  console.log(`[EXPIRATION WORKER] Found ${expiredBookings.length} expired stock bookings.`);

  let releasedCount = 0;
  for (const booking of expiredBookings) {
    try {
      await db.$transaction(async (tx) => {
        for (const item of booking.items) {
          const reservedQty = item.reservedQuantity;
          if (reservedQty <= 0) continue;

          const snapshot = item.product.inventory;
          const inv = snapshot ? await lockInventory(tx, snapshot.id) : null;
          if (inv) {
            // Release the reservation this booking actually holds (see the
            // cancellation path above for why blockedStock was wrong).
            const prevAvailable = inv.availableStock;
            const newReserved = Math.max(0, inv.reservedStock - reservedQty);
            const newAvailable = availableFrom({ ...inv, reservedStock: newReserved });

            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                reservedStock: newReserved,
                availableStock: newAvailable,
              },
            });

            // Stock Movement
            await tx.inventoryMovement.create({
              data: {
                inventoryId: inv.id,
                productId: item.productId,
                warehouseId: booking.warehouseId,
                movementType: "BLOCK_RELEASED",
                quantity: reservedQty,
                previousQuantity: prevAvailable,
                newQuantity: newAvailable,
                referenceType: "BOOKING",
                referenceId: booking.id,
                reason: `Booking ${booking.bookingNumber} Expiry. Stock Released automatically.`,
                performedBy: "SYSTEM_AUTO_EXPIRY",
              },
            });
          }

          await tx.stockBookingItem.update({
            where: { id: item.id },
            data: {
              reservedQuantity: 0,
            },
          });
        }

        await tx.stockBooking.update({
          where: { id: booking.id },
          data: {
            status: "EXPIRED",
            releasedAt: new Date(),
            notes: `${booking.notes || ""} [System Auto Expiry: confirmation deadline passed]`,
          },
        });

        await tx.auditLog.create({
          data: {
            action: "AUTO_EXPIRY_BOOKING",
            entity: "StockBooking",
            entityId: booking.id,
            meta: {
              performedBy: "SYSTEM_AUTO_EXPIRY",
              details: `Booking ${booking.bookingNumber} auto-expired. Stock released back to inventory.`,
            },
          },
        });
      }, STOCK_TX_OPTIONS);
      releasedCount++;
    } catch (err) {
      console.error(`[EXPIRATION WORKER] Failed auto-expiring booking ${booking.bookingNumber}:`, err);
    }
  }

  return { found: expiredBookings.length, released: releasedCount };
}

export async function allocateBookingStock({
  bookingId,
  allocatedBy,
}: {
  bookingId: string;
  allocatedBy: string;
}) {
  return await db.$transaction(async (tx) => {
    const booking = await tx.stockBooking.findUnique({
      where: { id: bookingId },
      include: {
        items: {
          include: {
            product: { include: { inventory: true } },
          },
        },
      },
    });

    if (!booking) throw new Error("Booking not found.");
    if (booking.status !== "CONFIRMED") {
      throw new Error(`Only confirmed bookings can be allocated. Current status: ${booking.status}`);
    }

    for (const item of booking.items) {
      const reservedQty = item.reservedQuantity;
      if (reservedQty <= 0) continue;

      const snapshot = item.product.inventory;
      const inv = snapshot ? await lockInventory(tx, snapshot.id) : null;
      if (inv) {
        // Allocation converts this booking's own reservation into an
        // allocation. It previously drained blockedStock, which belongs to the
        // block flow. Available is unchanged — both counters subtract from it.
        const newReserved = Math.max(0, inv.reservedStock - reservedQty);
        const newAllocated = inv.allocatedStock + reservedQty;

        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            reservedStock: newReserved,
            allocatedStock: newAllocated,
            availableStock: availableFrom({
              ...inv,
              reservedStock: newReserved,
              allocatedStock: newAllocated,
            }),
          },
        });

        // Movement
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            productId: item.productId,
            warehouseId: booking.warehouseId,
            movementType: "ALLOCATED",
            quantity: reservedQty,
            previousQuantity: inv.allocatedStock,
            newQuantity: newAllocated,
            referenceType: "BOOKING",
            referenceId: booking.id,
            reason: `Stock allocated for Dispatch for booking ${booking.bookingNumber}`,
            performedBy: allocatedBy,
          },
        });
      }

      await tx.stockBookingItem.update({
        where: { id: item.id },
        data: {
          reservedQuantity: 0,
          allocatedQuantity: reservedQty,
        },
      });
    }

    const updated = await tx.stockBooking.update({
      where: { id: bookingId },
      data: { status: "ALLOCATED" },
    });

    await tx.auditLog.create({
      data: {
        action: "ALLOCATE_BOOKING",
        entity: "StockBooking",
        entityId: bookingId,
        meta: {
          performedBy: allocatedBy,
          details: `Booking ${booking.bookingNumber} marked as ALLOCATED. Ready for shipment.`,
        },
      },
    });

    return updated;
  }, STOCK_TX_OPTIONS);
}

export async function fulfillBookingStock({
  bookingId,
  fulfilledBy,
}: {
  bookingId: string;
  fulfilledBy: string;
}) {
  return await db.$transaction(async (tx) => {
    const booking = await tx.stockBooking.findUnique({
      where: { id: bookingId },
      include: {
        items: {
          include: {
            product: { include: { inventory: true } },
          },
        },
      },
    });

    if (!booking) throw new Error("Booking not found.");
    if (booking.status !== "ALLOCATED") {
      throw new Error(`Only allocated bookings can be fulfilled. Current status: ${booking.status}`);
    }

    for (const item of booking.items) {
      const allocatedQty = item.allocatedQuantity;
      if (allocatedQty <= 0) continue;

      const snapshot = item.product.inventory;
      const inv = snapshot ? await lockInventory(tx, snapshot.id) : null;
      if (inv) {
        const prevAllocated = inv.allocatedStock;
        const newAllocated = Math.max(0, prevAllocated - allocatedQty);
        const prevTotal = inv.totalStock;
        const newTotal = Math.max(0, prevTotal - allocatedQty);

        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            allocatedStock: newAllocated,
            totalStock: newTotal,
            availableStock: availableFrom({
              ...inv,
              allocatedStock: newAllocated,
              totalStock: newTotal,
            }),
          },
        });

        // Movement
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            productId: item.productId,
            warehouseId: booking.warehouseId,
            movementType: "STOCK_OUT",
            quantity: allocatedQty,
            previousQuantity: prevTotal,
            newQuantity: newTotal,
            referenceType: "BOOKING",
            referenceId: booking.id,
            reason: `Dispatched / Flipped stock out for booking ${booking.bookingNumber}`,
            performedBy: fulfilledBy,
          },
        });
      }

      await tx.stockBookingItem.update({
        where: { id: item.id },
        data: {
          allocatedQuantity: 0,
          fulfilledQuantity: allocatedQty,
        },
      });
    }

    const updated = await tx.stockBooking.update({
      where: { id: bookingId },
      data: { status: "FULFILLED" },
    });

    await tx.auditLog.create({
      data: {
        action: "FULFILL_BOOKING",
        entity: "StockBooking",
        entityId: bookingId,
        meta: {
          performedBy: fulfilledBy,
          details: `Booking ${booking.bookingNumber} marked as FULFILLED. Stock shipped out.`,
        },
      },
    });

    return updated;
  }, STOCK_TX_OPTIONS);
}

// Queries for dashboards

export async function getBookingSummary(filters: { dealerId?: string; warehouseId?: string } = {}) {
  const where: any = {};
  if (filters.dealerId) where.dealerId = filters.dealerId;
  if (filters.warehouseId) where.warehouseId = filters.warehouseId;

  const [activeCount, pendingCount, expiringCount, confirmedCount, cancelledCount, rejectedCount] = await Promise.all([
    db.stockBooking.count({ where: { ...where, status: "APPROVED" } }),
    db.stockBooking.count({ where: { ...where, status: "PENDING_APPROVAL" } }),
    db.stockBooking.count({
      where: {
        ...where,
        status: "AWAITING_DEALER_CONFIRMATION",
        expiresAt: { not: null },
      },
    }),
    db.stockBooking.count({ where: { ...where, status: "CONFIRMED" } }),
    db.stockBooking.count({ where: { ...where, status: "CANCELLED" } }),
    db.stockBooking.count({ where: { ...where, status: "REJECTED" } }),
  ]);

  return {
    active: activeCount + expiringCount, // APPROVED/Awaiting confirmation
    pending: pendingCount,
    expiring: expiringCount,
    confirmed: confirmedCount,
    cancelled: cancelledCount,
    rejected: rejectedCount,
  };
}

export async function getBookingList(filters: {
  dealerId?: string;
  warehouseId?: string;
  status?: string;
  priority?: string;
  search?: string;
  requestedBy?: string;
}) {
  const where: any = {};
  
  if (filters.dealerId) where.dealerId = filters.dealerId;
  if (filters.warehouseId) where.warehouseId = filters.warehouseId;
  if (filters.requestedBy) where.requestedBy = filters.requestedBy;
  
  if (filters.status === "EXPIRING") {
    const next24h = new Date();
    next24h.setHours(next24h.getHours() + 24);
    where.status = "AWAITING_DEALER_CONFIRMATION";
    where.expiresAt = { lte: next24h, gte: new Date() };
  } else if (filters.status) {
    where.status = filters.status;
  }

  if (filters.priority) {
    where.priority = filters.priority;
  }

  if (filters.search) {
    where.OR = [
      { bookingNumber: { contains: filters.search, mode: "insensitive" } },
      { requestedBy: { contains: filters.search, mode: "insensitive" } },
      { dealer: { name: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  return await db.stockBooking.findMany({
    where,
    include: {
      dealer: true,
      warehouse: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBookingById(id: string) {
  return await db.stockBooking.findUnique({
    where: { id },
    include: {
      dealer: true,
      warehouse: true,
      items: {
        include: {
          product: {
            include: {
              inventory: true,
            },
          },
        },
      },
    },
  });
}
