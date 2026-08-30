import { db, STOCK_TX_OPTIONS } from "@/lib/db";
import { sendNotificationsToUsers } from "@/services/NotificationService";
import {
  lockInventoryByProduct,
  writeInventory,
  recordMovement,
  recordBlockAudit,
  nextBlockNumber,
  invalidateStockCaches,
  approveBlock,
  rejectBlock,
  cancelBlock,
  availableFrom,
} from "@/services/StockBlockService";
import { AppError, type BlockStatus } from "@/lib/permissions";

/**
 * Multi-product orders.
 *
 * A single-product StockBlock keeps working exactly as it always has —
 * `blockOrderId` is null for every historical row and for anything still
 * created through `createBlockRequest`. A BlockOrder is the header for a
 * NEW kind of submission: several StockBlock rows (one per product/quantity
 * line, each keeping its own reservation, shortage, procurement link,
 * shipping and delivery exactly as today) created together, atomically, and
 * numbered `${orderNumber}-${lineNumber}` off the same BLK-YYYY-NNNNNN
 * sequence every single-product block already uses.
 *
 * Approval/rejection/cancellation of an order intentionally do NOT introduce
 * a second, parallel state machine — they loop the existing single-item
 * `approveBlock`/`rejectBlock`/`cancelBlock` over each line, so every
 * transition, permission check and audit entry is the same tested code path
 * a single-product block already goes through. That keeps "one workflow,
 * many items" true without duplicating the state machine in two places.
 */

export interface BlockOrderItemInput {
  productId: string;
  quantity: number;
}

interface ValidatedLine {
  productId: string;
  productName: string;
  quantity: number;
}

/** Merges duplicate productId lines by summing quantity (spec §5/§6). */
function dedupeItems(items: BlockOrderItemInput[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + qty);
  }
  return merged;
}

export async function createMultiProductBlockRequest({
  items,
  dealerId,
  showroomId,
  remarks,
  durationHours = 48,
  requestedBy,
  createdById,
  userRole,
}: {
  items: BlockOrderItemInput[];
  dealerId?: string;
  showroomId?: string;
  remarks?: string;
  durationHours?: number;
  requestedBy: string;
  createdById?: string | null;
  userRole?: string;
}) {
  const merged = dedupeItems(items);
  if (merged.size === 0) {
    throw new AppError("Add at least one product with a quantity greater than zero.", 400, "VALIDATION");
  }
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new AppError("Hold duration must be greater than zero.", 400, "VALIDATION");
  }

  // ——— Pre-transaction validation, same checks as the single-item path ———
  const productIds = [...merged.keys()];
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, status: true, deletedAt: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const lines: ValidatedLine[] = [];
  for (const [productId, quantity] of merged) {
    const product = productById.get(productId);
    if (!product || product.deletedAt) {
      throw new AppError("One of the selected products no longer exists.", 404, "NOT_FOUND");
    }
    if (product.status !== "ACTIVE") {
      throw new AppError(`"${product.name}" is not active and cannot be blocked.`, 400, "VALIDATION");
    }
    lines.push({ productId, productName: product.name, quantity });
  }

  if (dealerId) {
    const dealer = await db.dealer.findUnique({ where: { id: dealerId }, select: { id: true, status: true, name: true } });
    if (!dealer) throw new AppError("That dealer no longer exists.", 404, "NOT_FOUND");
    if (dealer.status !== "ACTIVE") throw new AppError(`Dealer "${dealer.name}" is inactive.`, 400, "VALIDATION");
  }
  if (showroomId) {
    const showroom = await db.showroom.findUnique({ where: { id: showroomId }, select: { id: true } });
    if (!showroom) throw new AppError("That showroom no longer exists.", 404, "NOT_FOUND");
  }
  if ((userRole === "SHOWROOM_STAFF" || userRole === "SHOWROOM_INCHARGE") && !showroomId) {
    throw new AppError(
      "Your account is not assigned to a showroom. Ask an administrator to assign one before creating blocks.",
      400,
      "NO_SHOWROOM"
    );
  }

  const isStaff = userRole === "SHOWROOM_STAFF";
  const status: BlockStatus = isStaff ? "PENDING_INCHARGE_APPROVAL" : "PENDING_MANAGER_APPROVAL";
  const approvalRoute = isStaff ? "INCHARGE" : "DIRECT";
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const result = await db.$transaction(async (tx) => {
    const orderNumber = await nextBlockNumber(tx);

    const order = await tx.blockOrder.create({
      data: {
        orderNumber,
        dealerId: dealerId || null,
        showroomId: showroomId || null,
        requestedBy,
        createdById: createdById || null,
        createdRole: userRole || null,
        approvalRoute,
        remarks,
        expiresAt,
      },
    });

    // Lock inventory rows in a stable order (ascending productId) so a
    // concurrent order touching an overlapping product set can never
    // deadlock against this one (same discipline as ShipmentService).
    const sortedLines = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));

    const createdItems = [];
    let lineNumber = 0;
    for (const line of sortedLines) {
      lineNumber++;
      const inventory = await lockInventoryByProduct(tx, line.productId);
      if (!inventory) {
        throw new AppError(`No inventory record exists for "${line.productName}".`, 404, "NOT_FOUND");
      }

      const available = availableFrom(inventory);
      const shortage = Math.max(0, line.quantity - available);

      const item = await tx.stockBlock.create({
        data: {
          block_number: `${orderNumber}-${lineNumber}`,
          block_type: "BLOCKED",
          blockOrderId: order.id,
          productId: line.productId,
          inventoryId: inventory.id,
          warehouseId: inventory.warehouseId,
          dealerId: dealerId || null,
          showroomId: showroomId || null,
          quantity: line.quantity,
          shortageQuantity: shortage,
          requestedBy,
          createdById: createdById || null,
          createdRole: userRole || null,
          status,
          remarks,
          approvalRoute,
          expiresAt,
        },
      });

      const after = await writeInventory(tx, inventory, {
        blockedStock: inventory.blockedStock + line.quantity,
      });

      await recordMovement(tx, {
        inv: inventory,
        productId: line.productId,
        movementType: "BLOCK_CREATED",
        quantity: line.quantity,
        previousQuantity: available,
        newQuantity: after.availableStock,
        referenceId: item.id,
        reason: remarks || `Stock block requested (order ${orderNumber})`,
        performedBy: requestedBy,
      });

      await recordBlockAudit(tx, {
        action: "CREATE_BLOCK",
        blockId: item.id,
        userId: createdById,
        userName: requestedBy,
        role: userRole,
        toStatus: status,
        reason: remarks,
        meta: {
          blockNumber: item.block_number,
          orderNumber,
          quantity: line.quantity,
          productName: line.productName,
          availableAtCreation: available,
          shortageQuantity: shortage,
        },
      });

      createdItems.push({ ...item, productName: line.productName });
    }

    return { order, items: createdItems };
  }, STOCK_TX_OPTIONS);

  await invalidateStockCaches();

  const totalRequested = result.items.reduce((sum, i) => sum + i.quantity, 0);
  const totalShortage = result.items.reduce((sum, i) => sum + i.shortageQuantity, 0);

  await notifyOrderParties(result.order, {
    type: status === "PENDING_INCHARGE_APPROVAL" ? "BLOCK_CREATED" : "BLOCK_SENT_FOR_APPROVAL",
    title: status === "PENDING_INCHARGE_APPROVAL" ? "Block Awaiting Your Approval" : "New Block Awaiting Final Approval",
    message: `Order ${result.order.orderNumber} — ${result.items.length} product${result.items.length > 1 ? "s" : ""}, ${totalRequested} boxes — is waiting for approval.`,
    audiences: status === "PENDING_INCHARGE_APPROVAL" ? ["SHOWROOM_INCHARGE"] : ["MANAGERS", "SUPER_ADMINS"],
  });

  if (totalShortage > 0) {
    const shortageLines = result.items.filter((i) => i.shortageQuantity > 0);
    await notifyOrderParties(result.order, {
      type: "PROCUREMENT_REQUIRED",
      title: "Procurement Required",
      message: `Order ${result.order.orderNumber}: ${totalShortage} boxes across ${shortageLines.length} product${shortageLines.length > 1 ? "s" : ""} need to be procured.`,
      audiences: ["MANAGERS", "SUPER_ADMINS"],
      priority: "HIGH",
    });
  }

  return result;
}

type OrderAudience = "CREATOR" | "SHOWROOM_INCHARGE" | "MANAGERS" | "SUPER_ADMINS";

async function notifyOrderParties(
  order: { id: string; orderNumber: string; createdById: string | null; showroomId: string | null },
  {
    type,
    title,
    message,
    audiences,
    priority = "NORMAL",
  }: { type: string; title: string; message: string; audiences: OrderAudience[]; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT" }
) {
  try {
    const ids = new Set<string>();
    if (audiences.includes("CREATOR") && order.createdById) ids.add(order.createdById);

    if (audiences.includes("SHOWROOM_INCHARGE") && order.showroomId) {
      const incharges = await db.user.findMany({
        where: { showroomId: order.showroomId, role: "SHOWROOM_INCHARGE", status: "ACTIVE" },
        select: { id: true },
      });
      incharges.forEach((u) => ids.add(u.id));
    }

    if (audiences.includes("MANAGERS") || audiences.includes("SUPER_ADMINS")) {
      const staff = await db.user.findMany({
        where: {
          status: "ACTIVE",
          role: {
            in: [
              ...(audiences.includes("MANAGERS") ? (["MANAGER"] as const) : []),
              ...(audiences.includes("SUPER_ADMINS") ? (["SUPER_ADMIN"] as const) : []),
            ],
          },
        },
        select: { id: true },
      });
      staff.forEach((u) => ids.add(u.id));
    }

    if (ids.size === 0) return;
    await sendNotificationsToUsers({
      userIds: [...ids],
      type,
      title,
      message,
      priority,
      data: { orderId: order.id, orderNumber: order.orderNumber },
    });
  } catch (err) {
    console.error("[ORDER NOTIFY] failed:", err);
  }
}

interface ItemActionResult {
  blockId: string;
  blockNumber: string | null;
  ok: boolean;
  error?: string;
}

/** Approves every line of an order in full (spec §13 — one workflow, moves as one unit). */
export async function approveBlockOrder({
  orderId,
  approvedBy,
  approvedById,
  role,
  actorShowroomId,
}: {
  orderId: string;
  approvedBy: string;
  approvedById?: string | null;
  role: string;
  actorShowroomId?: string | null;
}): Promise<{ order: { id: string; orderNumber: string }; results: ItemActionResult[] }> {
  const order = await db.blockOrder.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, items: { select: { id: true, block_number: true } } },
  });
  if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
  if (order.items.length === 0) throw new AppError("This order has no items.", 400, "VALIDATION");

  const results: ItemActionResult[] = [];
  for (const item of order.items) {
    try {
      await approveBlock({ blockId: item.id, approvedBy, approvedById, role, actorShowroomId });
      results.push({ blockId: item.id, blockNumber: item.block_number, ok: true });
    } catch (e: any) {
      results.push({ blockId: item.id, blockNumber: item.block_number, ok: false, error: e?.message || "Approval failed." });
    }
  }

  return { order: { id: order.id, orderNumber: order.orderNumber }, results };
}

export async function rejectBlockOrder({
  orderId,
  rejectedBy,
  rejectedById,
  role,
  actorShowroomId,
  reason,
}: {
  orderId: string;
  rejectedBy: string;
  rejectedById?: string | null;
  role: string;
  actorShowroomId?: string | null;
  reason: string;
}): Promise<{ order: { id: string; orderNumber: string }; results: ItemActionResult[] }> {
  const order = await db.blockOrder.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, items: { select: { id: true, block_number: true } } },
  });
  if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");

  const results: ItemActionResult[] = [];
  for (const item of order.items) {
    try {
      await rejectBlock({ blockId: item.id, rejectedBy, rejectedById, role, actorShowroomId, reason });
      results.push({ blockId: item.id, blockNumber: item.block_number, ok: true });
    } catch (e: any) {
      results.push({ blockId: item.id, blockNumber: item.block_number, ok: false, error: e?.message || "Rejection failed." });
    }
  }

  return { order: { id: order.id, orderNumber: order.orderNumber }, results };
}

export async function cancelBlockOrder({
  orderId,
  performedBy,
  performedById,
  role,
  actorShowroomId,
  reason,
}: {
  orderId: string;
  performedBy: string;
  performedById?: string | null;
  role: string;
  actorShowroomId?: string | null;
  reason?: string;
}): Promise<{ order: { id: string; orderNumber: string }; results: ItemActionResult[] }> {
  const order = await db.blockOrder.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, items: { select: { id: true, block_number: true } } },
  });
  if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");

  const results: ItemActionResult[] = [];
  for (const item of order.items) {
    try {
      await cancelBlock({ blockId: item.id, performedBy, performedById, role, actorShowroomId, reason });
      results.push({ blockId: item.id, blockNumber: item.block_number, ok: true });
    } catch (e: any) {
      results.push({ blockId: item.id, blockNumber: item.block_number, ok: false, error: e?.message || "Cancellation failed." });
    }
  }

  return { order: { id: order.id, orderNumber: order.orderNumber }, results };
}

/** Full order detail — every item with its product/inventory/procurement context (spec §15/16). */
export async function getBlockOrderDetail(orderId: string) {
  const order = await db.blockOrder.findFirst({
    where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
    include: {
      dealer: { select: { id: true, dealerId: true, name: true, company: true, phone: true } },
      showroom: { select: { id: true, name: true, city: true } },
      warehouse: { select: { id: true, name: true } },
      items: {
        orderBy: { block_number: "asc" },
        include: {
          inventory: {
            select: {
              totalStock: true,
              blockedStock: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  productCode: true,
                  size: true,
                  thumbnail_key: true,
                  image_key: true,
                  brand: { select: { name: true } },
                },
              },
            },
          },
          procurementShipmentItem: {
            select: { id: true, status: true, shipment: { select: { id: true, shipmentNumber: true, status: true } } },
          },
        },
      },
    },
  });
  return order;
}
