/**
 * Centralised RBAC for Prestige Tiles.
 *
 * Single source of truth for "who may do what", shared by server actions,
 * API routes and UI. Hiding a button is presentation, not security — every
 * mutation path must call the matching `can*` helper server-side before doing
 * work. The UI imports the same helpers so the two can never drift.
 *
 * Phase 1 roles (exactly five):
 *   SUPER_ADMIN         full access
 *   MANAGER             final approval + shipping
 *   WEAVER              strictly read-only
 *   SHOWROOM_INCHARGE   create blocks + approve staff blocks
 *   SHOWROOM_STAFF      create blocks
 */

export const ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "WEAVER",
  "SHOWROOM_INCHARGE",
  "SHOWROOM_STAFF",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Roles that may never mutate anything. */
const READ_ONLY: readonly Role[] = ["WEAVER"];

// ————— Block lifecycle —————

export const BLOCK_STATUSES = [
  "PENDING_INCHARGE_APPROVAL",
  "PENDING_MANAGER_APPROVAL",
  "APPROVED",
  "READY_TO_SHIP",
  "SHIPPED",
  "PARTIALLY_SHIPPED",
  "DELIVERED",
  "PARTIALLY_DELIVERED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "RELEASED",
] as const;

export type BlockStatus = (typeof BLOCK_STATUSES)[number];

export function isBlockStatus(value: unknown): value is BlockStatus {
  return typeof value === "string" && (BLOCK_STATUSES as readonly string[]).includes(value);
}

/**
 * Every legal status transition. Anything absent here is rejected — the
 * frontend can never drive a block into an arbitrary state.
 */
export const ALLOWED_TRANSITIONS: Record<BlockStatus, readonly BlockStatus[]> = {
  PENDING_INCHARGE_APPROVAL: ["PENDING_MANAGER_APPROVAL", "REJECTED", "CANCELLED", "EXPIRED", "RELEASED"],
  PENDING_MANAGER_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED", "RELEASED"],
  APPROVED: ["READY_TO_SHIP", "CANCELLED", "EXPIRED", "RELEASED"],
  READY_TO_SHIP: ["SHIPPED", "PARTIALLY_SHIPPED", "CANCELLED", "RELEASED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "PARTIALLY_DELIVERED", "DELIVERED", "RELEASED"],
  SHIPPED: ["DELIVERED", "PARTIALLY_DELIVERED"],
  PARTIALLY_DELIVERED: ["DELIVERED"],
  // Terminal states.
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  RELEASED: [],
};

export function canTransition(from: BlockStatus, to: BlockStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses whose reserved quantity is still held against inventory. */
export const ACTIVE_BLOCK_STATUSES: readonly BlockStatus[] = [
  "PENDING_INCHARGE_APPROVAL",
  "PENDING_MANAGER_APPROVAL",
  "APPROVED",
  "READY_TO_SHIP",
  "PARTIALLY_SHIPPED",
];

export function isActiveBlock(status: BlockStatus): boolean {
  return ACTIVE_BLOCK_STATUSES.includes(status);
}

// ————— Capability checks —————

/** Everyone signed in can read. */
export function canViewProducts(role: Role): boolean {
  return isRole(role);
}
export const canViewInventory = canViewProducts;
export const canViewBlocks = canViewProducts;
export const canViewAuditLogs = canViewProducts;
export const canViewNotifications = canViewProducts;

export function canCreateBlock(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "SHOWROOM_INCHARGE" || role === "SHOWROOM_STAFF";
}

/**
 * Approval is status-aware: a staff-created block needs the In-Charge first,
 * and only then a Manager. Passing the block's creator lets us enforce that
 * an In-Charge never approves their own block.
 */
export function canApproveBlock(
  role: Role,
  status: BlockStatus,
  opts?: { createdById?: string | null; actorId?: string | null }
): boolean {
  if (READ_ONLY.includes(role)) return false;

  if (status === "PENDING_INCHARGE_APPROVAL") {
    if (role === "SUPER_ADMIN" || role === "MANAGER") return true;
    if (role !== "SHOWROOM_INCHARGE") return false;
    // An In-Charge may not sign off on a block they raised themselves.
    return !(opts?.actorId && opts.createdById && opts.actorId === opts.createdById);
  }

  if (status === "PENDING_MANAGER_APPROVAL") {
    return role === "SUPER_ADMIN" || role === "MANAGER";
  }

  return false;
}

export function canRejectBlock(
  role: Role,
  status: BlockStatus,
  opts?: { createdById?: string | null; actorId?: string | null }
): boolean {
  // Rejection authority mirrors approval authority at each stage.
  return canApproveBlock(role, status, opts);
}

export function canShipBlock(role: Role, status: BlockStatus): boolean {
  if (role !== "SUPER_ADMIN" && role !== "MANAGER") return false;
  return status === "READY_TO_SHIP" || status === "PARTIALLY_SHIPPED";
}

export function canDeliverBlock(role: Role, status: BlockStatus): boolean {
  if (role !== "SUPER_ADMIN" && role !== "MANAGER") return false;
  return status === "SHIPPED" || status === "PARTIALLY_SHIPPED" || status === "PARTIALLY_DELIVERED";
}

export function canMarkReadyToShip(role: Role, status: BlockStatus): boolean {
  return (role === "SUPER_ADMIN" || role === "MANAGER") && status === "APPROVED";
}

/**
 * Creators may cancel their own block while it is still active; Managers and
 * Super Admins may cancel any active block.
 */
export function canCancelBlock(
  role: Role,
  status: BlockStatus,
  opts?: { createdById?: string | null; actorId?: string | null }
): boolean {
  if (READ_ONLY.includes(role)) return false;
  if (!isActiveBlock(status)) return false;
  if (role === "SUPER_ADMIN" || role === "MANAGER") return true;
  if (role === "SHOWROOM_INCHARGE" || role === "SHOWROOM_STAFF") {
    return !!(opts?.actorId && opts.createdById && opts.actorId === opts.createdById);
  }
  return false;
}

export function canReleaseBlock(role: Role, status: BlockStatus): boolean {
  if (role !== "SUPER_ADMIN" && role !== "MANAGER") return false;
  return isActiveBlock(status);
}

// ————— Administration (Super Admin only) —————

export function canManageProducts(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Broadcasting announcements. Super Admin always; Manager retained because the
 * existing deployment already grants it (spec §20 allows Manager "only if
 * already configured"). Weaver and Showroom Staff must never send.
 */
export function canSendAnnouncements(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}
export const canManageDealers = canManageProducts;
export const canManageUsers = canManageProducts;
export const canManageRoles = canManageProducts;
export const canManageSystemSettings = canManageProducts;

/** True for roles that must never mutate state. */
export function isReadOnly(role: Role): boolean {
  return READ_ONLY.includes(role);
}

/**
 * Throwing guard for server-side use.
 * Call at the top of every mutating action/route.
 */
export function assertPermission(allowed: boolean, message = "You do not have permission to perform this action."): void {
  if (!allowed) {
    const err = new Error(message);
    (err as any).statusCode = 403;
    throw err;
  }
}
