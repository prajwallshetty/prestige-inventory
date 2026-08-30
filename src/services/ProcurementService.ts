import { db } from "@/lib/db";
import { createShipment, receiveShipmentStock, advanceShipmentStatus as advanceShipmentStatusRaw } from "@/services/ShipmentService";
import { sendNotificationsToUsers } from "@/services/NotificationService";
import { blockScopeClause, type BlockViewer } from "@/services/BlockQueryService";
import { deriveProcurementStatus, computeProcurementPriority, type ProcurementStatus } from "@/lib/procurementStatus";
import {
  AppError,
  assertPermission,
  canManageProcurement,
  ACTIVE_BLOCK_STATUSES,
  isShowroomScoped,
  type Role,
} from "@/lib/permissions";

export { deriveProcurementStatus, computeProcurementPriority, type ProcurementStatus };

/** Sidebar badge count — how many open shortages are waiting to be ordered. */
export async function getNeedToOrderCount(viewer: BlockViewer): Promise<number> {
  return db.stockBlock.count({
    where: {
      AND: [
        blockScopeClause(viewer),
        { shortageQuantity: { gt: 0 } },
        { procurementShipmentItemId: null },
        { status: { in: [...ACTIVE_BLOCK_STATUSES] } },
      ],
    },
  });
}

/**
 * The "Need to Order" / procurement workflow (overstock spec).
 *
 * Reuses the existing Shipment/ShipmentItem model as the supplier purchase
 * order — that model already carries exactly the SUPPLIER → DEPOT lifecycle
 * this needs (EXPECTED → DISPATCHED → IN_TRANSIT → ARRIVED → RECEIVING →
 * PARTIALLY_RECEIVED → RECEIVED → CANCELLED), and is otherwise unused, so
 * there is no duplicate concept to reconcile. `StockBlock.shortageQuantity`
 * carries the per-block "Need to Order" figure computed at creation, and
 * `StockBlock.procurementShipmentItemId` links a block's shortage to the
 * purchase-order line covering it once a Manager acts on it (spec §27 — one
 * line can cover several blocks for the same product).
 *
 * A block's own procurement status is never stored — it is always derived
 * from `shortageQuantity` plus the linked ShipmentItem/Shipment status, so
 * there is exactly one place that can drift (the Shipment/ShipmentItem rows
 * already written by the receiving flow) rather than two.
 */

function assertCanManageProcurement(role: string) {
  assertPermission(
    canManageProcurement(role as Role),
    "Only a Manager or Super Admin can manage procurement."
  );
}

// ————————————————————————————————————————————————
// Need to Order — reads
// ————————————————————————————————————————————————

export interface NeedToOrderFilters {
  search?: string;
  productId?: string;
  brandId?: string;
  showroomId?: string;
  priority?: "URGENT" | "NORMAL";
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

const NEED_TO_ORDER_SELECT = {
  id: true,
  block_number: true,
  status: true,
  quantity: true,
  shortageQuantity: true,
  createdAt: true,
  showroom: { select: { id: true, name: true, city: true } },
  inventory: {
    select: {
      totalStock: true,
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          productCode: true,
          size: true,
          brand: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

function needToOrderSort(sort?: string): any {
  switch (sort) {
    case "shortage_desc":
      return { shortageQuantity: "desc" };
    case "oldest":
      return { createdAt: "asc" };
    default:
      return { createdAt: "desc" };
  }
}

/**
 * Every open (not yet ordered) shortage, one row per contributing block, so
 * the Manager can see exactly which blocks a purchase order will cover
 * (spec §10/§33). Only blocks whose reservation is still active are
 * included — a cancelled/rejected/expired block's shortage is moot.
 */
export async function getNeedToOrderList(filters: NeedToOrderFilters, viewer: BlockViewer) {
  const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
  const page = Math.max(filters.page || 1, 1);
  const skip = (page - 1) * limit;

  const and: any[] = [
    blockScopeClause(viewer),
    { shortageQuantity: { gt: 0 } },
    { procurementShipmentItemId: null },
    { status: { in: [...ACTIVE_BLOCK_STATUSES] } },
  ];

  if (filters.productId) and.push({ productId: filters.productId });
  if (filters.brandId) and.push({ inventory: { is: { product: { is: { brandId: filters.brandId } } } } });
  if (filters.showroomId && !isShowroomScoped(viewer.role)) and.push({ showroomId: filters.showroomId });

  const q = (filters.search || "").trim();
  if (q.length >= 2) {
    const like = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { block_number: like },
        { inventory: { is: { product: { is: { name: like } } } } },
        { inventory: { is: { product: { is: { sku: like } } } } },
        { inventory: { is: { product: { is: { productCode: like } } } } },
        { inventory: { is: { product: { is: { brand: { is: { name: like } } } } } } },
        { showroom: { is: { name: like } } },
      ],
    });
  }

  const createdAt: any = {};
  if (filters.from) {
    const d = new Date(filters.from);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (filters.to) {
    const d = new Date(filters.to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      createdAt.lte = d;
    }
  }
  if (Object.keys(createdAt).length > 0) and.push({ createdAt });

  const where = { AND: and };

  const [rows, total] = await Promise.all([
    db.stockBlock.findMany({
      where,
      select: NEED_TO_ORDER_SELECT,
      orderBy: needToOrderSort(filters.sort),
      skip,
      take: limit,
    }),
    db.stockBlock.count({ where }),
  ]);

  // Priority is computed, not stored — filter after the fact rather than
  // trying to express "age > 72h OR status = READY_TO_SHIP" as a single
  // indexed WHERE clause for what is a small, human-scale queue.
  let items = rows.map(serialiseNeedToOrderRow);
  if (filters.priority) items = items.filter((r) => r.priority === filters.priority);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function serialiseNeedToOrderRow(b: any) {
  const product = b.inventory?.product ?? null;
  return {
    blockId: b.id as string,
    blockNumber: b.block_number as string | null,
    status: b.status as string,
    requestedQuantity: b.quantity as number,
    availableQuantity: Math.max(0, b.quantity - b.shortageQuantity),
    shortageQuantity: b.shortageQuantity as number,
    physicalStock: b.inventory?.totalStock ?? 0,
    priority: computeProcurementPriority({ status: b.status, createdAt: b.createdAt }),
    createdAt: b.createdAt?.toISOString() ?? null,
    showroom: b.showroom ?? null,
    product: product
      ? {
          id: product.id,
          name: product.name,
          productNumber: product.sku || product.productCode || "—",
          size: product.size,
          brand: product.brand ?? null,
        }
      : null,
  };
}

/** Dashboard tiles — every count is a live aggregate, no placeholder numbers (spec §11). */
export async function getProcurementDashboardSummary(viewer: BlockViewer) {
  const scope = blockScopeClause(viewer);

  const openShortageWhere = {
    AND: [scope, { shortageQuantity: { gt: 0 } }, { procurementShipmentItemId: null }, { status: { in: [...ACTIVE_BLOCK_STATUSES] } }],
  };

  const [needToOrder, needToOrderProducts, pendingPurchase, inTransitOnly, receivedAgg] = await Promise.all([
    db.stockBlock.aggregate({
      where: openShortageWhere,
      _sum: { shortageQuantity: true },
      _count: { _all: true },
    }),
    db.stockBlock.groupBy({ by: ["productId"], where: openShortageWhere }),
    db.shipmentItem.aggregate({
      where: { shipment: { status: "EXPECTED" } },
      _sum: { expectedQuantity: true },
    }),
    db.shipmentItem.aggregate({
      where: { shipment: { status: { in: ["DISPATCHED", "IN_TRANSIT", "ARRIVED", "RECEIVING"] } } },
      _sum: { expectedQuantity: true },
    }),
    db.shipmentItem.aggregate({
      where: { status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] } },
      _sum: { receivedQuantity: true },
    }),
  ]);

  return {
    needToOrderProducts: needToOrderProducts.length,
    needToOrderBoxes: needToOrder._sum.shortageQuantity ?? 0,
    needToOrderBlocks: needToOrder._count._all,
    pendingPurchaseBoxes: pendingPurchase._sum.expectedQuantity ?? 0,
    inTransitBoxes: inTransitOnly._sum.expectedQuantity ?? 0,
    receivedBoxes: receivedAgg._sum.receivedQuantity ?? 0,
  };
}

// ————————————————————————————————————————————————
// Purchase orders — reads
// ————————————————————————————————————————————————

export interface ProcurementOrderFilters {
  search?: string;
  status?: string; // ORDERED | IN_TRANSIT | RECEIVED | CANCELLED (maps onto Shipment.status groups)
  page?: number;
  limit?: number;
}

const ORDER_STATUS_GROUPS: Record<string, readonly string[]> = {
  ORDERED: ["EXPECTED"],
  IN_TRANSIT: ["DISPATCHED", "IN_TRANSIT", "ARRIVED", "RECEIVING"],
  RECEIVED: ["RECEIVED", "PARTIALLY_RECEIVED"],
  CANCELLED: ["CANCELLED"],
};

export async function getProcurementOrdersList(filters: ProcurementOrderFilters) {
  const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
  const page = Math.max(filters.page || 1, 1);
  const skip = (page - 1) * limit;

  const and: any[] = [];
  if (filters.status && ORDER_STATUS_GROUPS[filters.status]) {
    and.push({ status: { in: [...ORDER_STATUS_GROUPS[filters.status]] } });
  }
  const q = (filters.search || "").trim();

  // ShipmentItem.productId is a plain column (no Prisma relation — see the
  // schema note by StockBlock's own createdById/updatedById columns for why
  // audit-style ids are kept as plain columns rather than every table
  // growing a formal FK), so product name/sku is resolved with a second
  // query rather than a nested `include`.
  let productIdFilter: string[] | undefined;
  if (q.length >= 2) {
    const matchingProducts = await db.product.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 200,
    });
    productIdFilter = matchingProducts.map((p) => p.id);
  }

  if (q.length >= 2) {
    const like = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { shipmentNumber: like },
        { supplier: like },
        { purchaseReference: like },
        ...(productIdFilter && productIdFilter.length > 0
          ? [{ items: { some: { productId: { in: productIdFilter } } } }]
          : []),
      ],
    });
  }

  const where = and.length ? { AND: and } : {};

  const [rows, total] = await Promise.all([
    db.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            blocks: { select: { id: true, block_number: true, showroomId: true } },
          },
        },
      },
    }),
    db.shipment.count({ where }),
  ]);

  const productIds = Array.from(new Set(rows.flatMap((s) => s.items.map((i) => i.productId))));
  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true, productCode: true, size: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const items = rows.map((shipment) => ({
    ...shipment,
    items: shipment.items.map((item) => ({
      ...item,
      product: productById.get(item.productId) ?? null,
    })),
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ————————————————————————————————————————————————
// Purchase orders — writes
// ————————————————————————————————————————————————

async function nextPurchaseOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.shipment.count({ where: { shipmentNumber: { startsWith: `PO-${year}-` } } });
  return `PO-${year}-${String(count + 1).padStart(6, "0")}`;
}

async function recordProcurementAudit({
  action,
  shipmentId,
  userId,
  userName,
  role,
  meta,
}: {
  action: string;
  shipmentId: string;
  userId?: string | null;
  userName: string;
  role?: string | null;
  meta?: Record<string, unknown>;
}) {
  await db.auditLog.create({
    data: {
      action,
      entity: "Shipment",
      entityId: shipmentId,
      userId: userId || null,
      roleAtTime: role || null,
      meta: { performedBy: userName, ...(meta || {}) },
    },
  });
}

/**
 * Manager's "Order Stock" action (spec §19): turns one or more open
 * shortages for the *same product* into a single purchase order, and links
 * each contributing block to the resulting order line so their status
 * advances together.
 */
export async function createPurchaseOrder({
  blockIds,
  supplier,
  purchaseReference,
  expectedDate,
  warehouseId,
  remarks,
  performedBy,
  performedById,
  role,
}: {
  blockIds: string[];
  supplier?: string;
  purchaseReference?: string;
  expectedDate?: Date;
  warehouseId?: string;
  remarks?: string;
  performedBy: string;
  performedById?: string | null;
  role: string;
}) {
  assertCanManageProcurement(role);
  if (!blockIds || blockIds.length === 0) {
    throw new AppError("Select at least one shortage to order.", 400, "VALIDATION");
  }

  const blocks = await db.stockBlock.findMany({
    where: { id: { in: blockIds } },
    select: {
      id: true,
      block_number: true,
      productId: true,
      shortageQuantity: true,
      procurementShipmentItemId: true,
      inventory: { select: { warehouseId: true } },
    },
  });
  if (blocks.length !== blockIds.length) {
    throw new AppError("One or more selected blocks were not found.", 404, "NOT_FOUND");
  }
  const alreadyLinked = blocks.find((b) => b.procurementShipmentItemId);
  if (alreadyLinked) {
    throw new AppError(`Block ${alreadyLinked.block_number} is already on a purchase order.`, 409, "CONFLICT");
  }
  const noShortage = blocks.find((b) => b.shortageQuantity <= 0);
  if (noShortage) {
    throw new AppError(`Block ${noShortage.block_number} has no shortage to order.`, 400, "VALIDATION");
  }
  const distinctProducts = new Set(blocks.map((b) => b.productId));
  if (distinctProducts.size > 1) {
    throw new AppError("All selected shortages must be for the same product — raise separate orders.", 400, "VALIDATION");
  }

  const productId = blocks[0].productId;
  const totalShortage = blocks.reduce((sum, b) => sum + b.shortageQuantity, 0);
  const resolvedWarehouseId = warehouseId || blocks[0].inventory?.warehouseId || undefined;

  let shipment;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      shipment = await createShipment({
        shipmentNumber: await nextPurchaseOrderNumber(),
        supplier,
        purchaseReference,
        warehouseId: resolvedWarehouseId,
        expectedDate,
        remarks,
        createdById: performedById,
        items: [{ productId, expectedQuantity: totalShortage }],
      });
      break;
    } catch (e: any) {
      // Two Managers raising a PO in the same instant can collide on the
      // count-derived number; retry with a freshly recomputed one.
      if (e?.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  if (!shipment) throw new AppError("Could not allocate a purchase order number.", 500, "INTERNAL");

  const item = shipment.items[0];
  await db.stockBlock.updateMany({
    where: { id: { in: blockIds } },
    data: { procurementShipmentItemId: item.id },
  });

  await recordProcurementAudit({
    action: "CREATE_PURCHASE_ORDER",
    shipmentId: shipment.id,
    userId: performedById,
    userName: performedBy,
    role,
    meta: { shipmentNumber: shipment.shipmentNumber, productId, totalShortage, blockIds, supplier, purchaseReference },
  });

  await notifyProcurementParties(blockIds, {
    type: "PROCUREMENT_ORDERED",
    title: "Purchase Order Raised",
    message: `Purchase order ${shipment.shipmentNumber} was raised for ${totalShortage} boxes.`,
  });

  return shipment;
}

/** Moves a purchase order through EXPECTED → DISPATCHED → IN_TRANSIT → ARRIVED, or cancels it. */
export async function advanceProcurementStatus({
  shipmentId,
  status,
  performedBy,
  performedById,
  role,
}: {
  shipmentId: string;
  status: "DISPATCHED" | "IN_TRANSIT" | "ARRIVED" | "CANCELLED";
  performedBy: string;
  performedById?: string | null;
  role: string;
}) {
  assertCanManageProcurement(role);

  const before = await db.shipment.findUnique({ where: { id: shipmentId }, select: { status: true, shipmentNumber: true } });
  if (!before) throw new AppError("Purchase order not found.", 404, "NOT_FOUND");

  const updated = await advanceShipmentStatusRaw({ shipmentId, status });

  await recordProcurementAudit({
    action: "ADVANCE_PURCHASE_ORDER",
    shipmentId,
    userId: performedById,
    userName: performedBy,
    role,
    meta: { from: before.status, to: status },
  });

  if (status !== "CANCELLED") {
    const blockIds = (
      await db.stockBlock.findMany({
        where: { procurementShipmentItem: { shipmentId } },
        select: { id: true },
      })
    ).map((b) => b.id);

    if (status === "IN_TRANSIT") {
      await notifyProcurementParties(blockIds, {
        type: "PROCUREMENT_IN_TRANSIT",
        title: "Procurement In Transit",
        message: `Purchase order ${updated.shipmentNumber} is now in transit from the supplier.`,
      });
    }
  }

  return updated;
}

/** Manager records what actually arrived (spec §21) — the one point physical stock increases. */
export async function receiveProcurement({
  shipmentId,
  receivedItems,
  performedBy,
  performedById,
  role,
}: {
  shipmentId: string;
  receivedItems: Array<{ shipmentItemId: string; receivedQuantity: number; damagedQuantity: number }>;
  performedBy: string;
  performedById?: string | null;
  role: string;
}) {
  assertCanManageProcurement(role);
  if (!receivedItems || receivedItems.length === 0) {
    throw new AppError("Record at least one received line.", 400, "VALIDATION");
  }

  const affectedBlockIds = (
    await db.stockBlock.findMany({
      where: { procurementShipmentItemId: { in: receivedItems.map((i) => i.shipmentItemId) } },
      select: { id: true },
    })
  ).map((b) => b.id);

  const updated = await receiveShipmentStock({ shipmentId, receivedItems, performedBy });

  await recordProcurementAudit({
    action: "RECEIVE_PURCHASE_ORDER",
    shipmentId,
    userId: performedById,
    userName: performedBy,
    role,
    meta: { status: updated.status, receivedItems },
  });

  await notifyProcurementParties(affectedBlockIds, {
    type: "PROCUREMENT_RECEIVED",
    title: "Procurement Received",
    message: `Purchase order ${updated.shipmentNumber} has been received at the depot.`,
  });

  return updated;
}

/**
 * Notifies whoever raised the affected blocks, plus the Manager/Super Admin
 * group, once per procurement event — never per block, so a purchase order
 * covering ten blocks sends one notification, not ten (spec §28/§36).
 */
async function notifyProcurementParties(
  blockIds: string[],
  { type, title, message }: { type: string; title: string; message: string }
) {
  if (blockIds.length === 0) return;
  try {
    const blocks = await db.stockBlock.findMany({
      where: { id: { in: blockIds } },
      select: { id: true, block_number: true, createdById: true },
    });

    const [managers, creators] = await Promise.all([
      db.user.findMany({
        where: { status: "ACTIVE", role: { in: ["MANAGER", "SUPER_ADMIN"] } },
        select: { id: true },
      }),
      Promise.resolve(blocks.map((b) => b.createdById).filter((id): id is string => !!id)),
    ]);

    const userIds = Array.from(new Set([...managers.map((m) => m.id), ...creators]));
    if (userIds.length === 0) return;

    await sendNotificationsToUsers({
      userIds,
      type,
      title,
      message,
      data: { blockIds, blockNumbers: blocks.map((b) => b.block_number) },
    });
  } catch (err) {
    // Notification failure must never roll back a completed procurement action.
    console.error("[PROCUREMENT NOTIFY] failed:", err);
  }
}
