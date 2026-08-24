import { db } from "@/lib/db";
import {
  ACTIVE_BLOCK_STATUSES,
  PENDING_BLOCK_STATUSES,
  isBlockStatus,
  isShowroomScoped,
  type Role,
} from "@/lib/permissions";

/**
 * Reads for the block list and approval queues.
 *
 * Everything the table needs — filtering, sorting, searching, paging and role
 * scoping — happens in the database. The previous page loaded *every* block
 * with no limit and filtered in the browser (spec §25).
 */

export interface BlockListFilters {
  /** Real status, or the aliases PENDING / ACTIVE / EXPIRING. */
  status?: string;
  search?: string;
  dealerId?: string;
  showroomId?: string;
  createdById?: string;
  /** ISO dates bounding StockBlock.createdAt. */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface BlockViewer {
  role: Role;
  userId?: string | null;
  showroomId?: string | null;
  warehouseId?: string | null;
}

const BLOCK_SORTS: Record<string, any> = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  expiry_asc: { expiresAt: "asc" },
  expiry_desc: { expiresAt: "desc" },
  quantity_desc: { quantity: "desc" },
  updated: { createdAt: "desc" },
};

/**
 * Scope clause for a viewer.
 *
 * Showroom roles see their own showroom only; a user with no showroom
 * assigned sees nothing rather than everything, which is the safe direction.
 * Managers are limited to their warehouse when one is assigned.
 */
export function blockScopeClause(viewer: BlockViewer): any {
  if (isShowroomScoped(viewer.role)) {
    return { showroomId: viewer.showroomId ?? "__none__" };
  }
  if (viewer.role === "MANAGER" && viewer.warehouseId) {
    // Blocks raised without a warehouse (no inventory warehouse set) stay
    // visible so nothing silently disappears from the approval queue.
    return { OR: [{ warehouseId: viewer.warehouseId }, { warehouseId: null }] };
  }
  return {};
}

/** Translates the status filter, including the aliases the UI links to. */
function statusClause(status?: string): any {
  if (!status) return {};

  if (status === "PENDING") {
    // "Pending Approvals" — the previous UI linked to the literal "PENDING",
    // which matches no row in the state machine, so the queue was always empty.
    return { status: { in: [...PENDING_BLOCK_STATUSES] } };
  }
  if (status === "ACTIVE") {
    return { status: { in: [...ACTIVE_BLOCK_STATUSES] } };
  }
  if (status === "EXPIRING") {
    const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      status: { in: [...ACTIVE_BLOCK_STATUSES] },
      expiresAt: { lte: next24h, gte: new Date() },
    };
  }
  if (isBlockStatus(status)) return { status };

  // An unrecognised value must not silently widen the result set.
  return { status: "__unknown__" };
}

function searchClause(search?: string): any {
  const q = (search || "").trim();
  if (q.length < 2) return {};

  const terms = q.split(/[\s,+]+/).filter(Boolean).slice(0, 10);
  if (terms.length === 0) return {};

  const like = (t: string) => ({ contains: t, mode: "insensitive" as const });

  const termClauses = terms.map((t) => {
    const variants = new Set<string>();
    variants.add(t);

    const clean = t.replace(/[^a-zA-Z0-9]/g, "");
    if (clean && clean !== t) variants.add(clean);

    const hyphenated = t.replace(/^([a-zA-Z]+)(\d+)$/, "$1-$2");
    if (hyphenated !== t) variants.add(hyphenated);

    const termVariants = Array.from(variants);

    return {
      OR: termVariants.flatMap((v) => [
        { block_number: like(v) },
        { requestedBy: like(v) },
        { remarks: like(v) },
        { dealer: { is: { name: like(v) } } },
        { dealer: { is: { dealerId: like(v) } } },
        { dealer: { is: { company: like(v) } } },
        { showroom: { is: { name: like(v) } } },
        { inventory: { is: { product: { is: { name: like(v) } } } } },
        { inventory: { is: { product: { is: { sku: like(v) } } } } },
        { inventory: { is: { product: { is: { productCode: like(v) } } } } },
        { inventory: { is: { product: { is: { size: like(v) } } } } },
        { inventory: { is: { product: { is: { color: like(v) } } } } },
        { inventory: { is: { product: { is: { finish: like(v) } } } } },
      ]),
    };
  });

  return { AND: termClauses };
}

/** Only the columns the table and the action buttons actually read. */
const BLOCK_LIST_SELECT = {
  id: true,
  block_number: true,
  block_type: true,
  status: true,
  quantity: true,
  shippedQuantity: true,
  deliveredQuantity: true,
  requestedBy: true,
  createdById: true,
  createdRole: true,
  approvalRoute: true,
  remarks: true,
  blocked_by: true,
  createdAt: true,
  expiresAt: true,
  approvedAt: true,
  inchargeApprovedBy: true,
  inchargeApprovedAt: true,
  managerApprovedBy: true,
  managerApprovedAt: true,
  readyToShipAt: true,
  shippedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  releasedAt: true,
  showroomId: true,
  dealer: { select: { id: true, dealerId: true, name: true, company: true } },
  showroom: { select: { id: true, name: true, city: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  inventory: {
    select: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          productCode: true,
          importKey: true,
          size: true,
          thumbnail_key: true,
          image_key: true,
          brand: { select: { name: true } },
        },
      },
    },
  },
} as const;

export type BlockListItem = Awaited<ReturnType<typeof getBlockList>>["items"][number];

export async function getBlockList(filters: BlockListFilters, viewer: BlockViewer) {
  const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
  const page = Math.max(filters.page || 1, 1);
  const skip = (page - 1) * limit;

  const and: any[] = [
    blockScopeClause(viewer),
    statusClause(filters.status),
    searchClause(filters.search),
  ];

  if (filters.dealerId) and.push({ dealerId: filters.dealerId });
  if (filters.createdById) and.push({ createdById: filters.createdById });
  // A showroom filter from the URL can only narrow, never widen, the scope.
  if (filters.showroomId && !isShowroomScoped(viewer.role)) {
    and.push({ showroomId: filters.showroomId });
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

  const where = { AND: and.filter((c) => Object.keys(c).length > 0) };

  const [rows, total, statusCounts] = await Promise.all([
    db.stockBlock.findMany({
      where,
      select: BLOCK_LIST_SELECT,
      orderBy: BLOCK_SORTS[filters.sort || "newest"] ?? BLOCK_SORTS.newest,
      skip,
      take: limit,
    }),
    db.stockBlock.count({ where }),
    // Tab counts respect scope but ignore the current status filter, so the
    // tab bar keeps showing where the work is.
    db.stockBlock.groupBy({
      by: ["status"],
      where: {
        AND: [blockScopeClause(viewer), searchClause(filters.search)].filter(
          (c) => Object.keys(c).length > 0
        ),
      },
      _count: { _all: true },
    }),
  ]);

  const countFor = (statuses: readonly string[]) =>
    statusCounts.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r._count._all, 0);

  return {
    items: rows.map(serialiseBlock),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    counts: {
      all: statusCounts.reduce((n, r) => n + r._count._all, 0),
      pending: countFor(PENDING_BLOCK_STATUSES),
      pendingIncharge: countFor(["PENDING_INCHARGE_APPROVAL"]),
      pendingManager: countFor(["PENDING_MANAGER_APPROVAL"]),
      readyToShip: countFor(["READY_TO_SHIP"]),
      shipped: countFor(["SHIPPED", "PARTIALLY_SHIPPED"]),
      delivered: countFor(["DELIVERED", "PARTIALLY_DELIVERED"]),
      closed: countFor(["REJECTED", "CANCELLED", "EXPIRED", "RELEASED"]),
    },
  };
}

/** Dates become ISO strings so the row can cross the server/client boundary. */
/** Most recent stage timestamp on a block — its effective "updated at". */
function lastActivityOf(b: any): string | null {
  const stamps = [
    b.deliveredAt,
    b.shippedAt,
    b.readyToShipAt,
    b.cancelledAt,
    b.releasedAt,
    b.managerApprovedAt,
    b.approvedAt,
    b.inchargeApprovedAt,
    b.createdAt,
  ].filter(Boolean) as Date[];

  if (stamps.length === 0) return null;
  return new Date(Math.max(...stamps.map((d) => d.getTime()))).toISOString();
}

function serialiseBlock(b: any) {
  const product = b.inventory?.product ?? null;
  return {
    id: b.id,
    blockNumber: b.block_number,
    blockType: b.block_type,
    status: b.status,
    quantity: b.quantity,
    shippedQuantity: b.shippedQuantity,
    deliveredQuantity: b.deliveredQuantity,
    requestedBy: b.requestedBy,
    createdById: b.createdById,
    createdRole: b.createdRole,
    approvalRoute: b.approvalRoute,
    remarks: b.remarks,
    blockedBy: b.blocked_by,
    showroomId: b.showroomId,
    createdAt: b.createdAt?.toISOString() ?? null,
    expiresAt: b.expiresAt?.toISOString() ?? null,
    approvedAt: b.approvedAt?.toISOString() ?? null,
    inchargeApprovedBy: b.inchargeApprovedBy,
    inchargeApprovedAt: b.inchargeApprovedAt?.toISOString() ?? null,
    managerApprovedBy: b.managerApprovedBy,
    managerApprovedAt: b.managerApprovedAt?.toISOString() ?? null,
    readyToShipAt: b.readyToShipAt?.toISOString() ?? null,
    shippedAt: b.shippedAt?.toISOString() ?? null,
    deliveredAt: b.deliveredAt?.toISOString() ?? null,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    releasedAt: b.releasedAt?.toISOString() ?? null,
    // StockBlock carries a timestamp per stage rather than one updatedAt, so
    // "last activity" is the most recent of them (§25's Updated column).
    lastActivityAt: lastActivityOf(b),
    dealer: b.dealer ?? null,
    showroom: b.showroom ?? null,
    warehouse: b.warehouse ?? null,
    product: product
      ? {
          id: product.id,
          name: product.name,
          productNumber: product.sku || product.productCode || product.importKey || "—",
          size: product.size,
          brand: product.brand?.name ?? null,
          thumbnailKey: product.thumbnail_key || product.image_key || null,
        }
      : null,
  };
}

/**
 * How many blocks are waiting on this specific user — drives the sidebar
 * badge and the dashboard tile.
 */
export async function getPendingApprovalCount(viewer: BlockViewer): Promise<number> {
  const scope = blockScopeClause(viewer);

  if (viewer.role === "SHOWROOM_INCHARGE") {
    return db.stockBlock.count({
      where: {
        AND: [
          scope,
          { status: "PENDING_INCHARGE_APPROVAL" },
          // A block they raised themselves is not theirs to approve (§11).
          viewer.userId ? { NOT: { createdById: viewer.userId } } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    });
  }

  if (viewer.role === "MANAGER" || viewer.role === "SUPER_ADMIN") {
    return db.stockBlock.count({
      where: { AND: [scope, { status: "PENDING_MANAGER_APPROVAL" }] },
    });
  }

  return 0;
}
