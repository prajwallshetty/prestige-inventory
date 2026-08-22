/**
 * Centralised RBAC + block state machine for Prestige Tiles.
 *
 * Single source of truth for "who may do what", shared by server actions,
 * API routes and UI. Hiding a button is presentation, not security — every
 * mutation path must call the matching `can*` helper server-side before doing
 * work. The UI imports the same helpers so the two can never drift.
 *
 * Phase 1 roles (exactly five):
 *   SUPER_ADMIN         full access
 *   MANAGER             final approval + shipping + delivery
 *   WEAVER              strictly read-only
 *   SHOWROOM_INCHARGE   create blocks + approve staff blocks in own showroom
 *   SHOWROOM_STAFF      create blocks + cancel own blocks
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

/** Roles whose visibility is limited to their own showroom. */
const SHOWROOM_SCOPED: readonly Role[] = ["SHOWROOM_INCHARGE", "SHOWROOM_STAFF"];

export function isShowroomScoped(role: Role): boolean {
  return SHOWROOM_SCOPED.includes(role);
}

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
 * Statuses awaiting a human decision. Used by the approval queues so a single
 * `?status=PENDING` filter resolves to both real pending states rather than a
 * literal that matches nothing.
 */
export const PENDING_BLOCK_STATUSES: readonly BlockStatus[] = [
  "PENDING_INCHARGE_APPROVAL",
  "PENDING_MANAGER_APPROVAL",
];

/**
 * Every legal status transition. Anything absent here is rejected — the
 * frontend can never drive a block into an arbitrary state.
 *
 * Manager approval lands directly on READY_TO_SHIP (spec §4). `APPROVED` is
 * retained only so historical rows created before that change can still be
 * moved forward.
 */
export const ALLOWED_TRANSITIONS: Record<BlockStatus, readonly BlockStatus[]> = {
  PENDING_INCHARGE_APPROVAL: ["PENDING_MANAGER_APPROVAL", "REJECTED", "CANCELLED", "EXPIRED", "RELEASED"],
  PENDING_MANAGER_APPROVAL: ["READY_TO_SHIP", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED", "RELEASED"],
  // Legacy state — only forward into the current flow.
  APPROVED: ["READY_TO_SHIP", "CANCELLED", "EXPIRED", "RELEASED"],
  READY_TO_SHIP: ["SHIPPED", "PARTIALLY_SHIPPED", "CANCELLED", "EXPIRED", "RELEASED"],
  // A second partial shipment keeps the block in PARTIALLY_SHIPPED.
  PARTIALLY_SHIPPED: ["PARTIALLY_SHIPPED", "SHIPPED", "PARTIALLY_DELIVERED", "DELIVERED"],
  SHIPPED: ["DELIVERED", "PARTIALLY_DELIVERED"],
  PARTIALLY_DELIVERED: ["PARTIALLY_DELIVERED", "DELIVERED"],
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

/**
 * Statuses that may still expire. `PARTIALLY_SHIPPED` is deliberately excluded:
 * part of the goods have already left, so the hold is no longer a simple
 * reservation that can be handed back whole.
 */
export const EXPIRABLE_BLOCK_STATUSES: readonly BlockStatus[] = [
  "PENDING_INCHARGE_APPROVAL",
  "PENDING_MANAGER_APPROVAL",
  "APPROVED",
  "READY_TO_SHIP",
];

// ————— Capability checks —————

/** Everyone signed in can read. */
export function canViewProducts(role: Role): boolean {
  return isRole(role);
}
export const canViewInventory = canViewProducts;
export const canViewBlocks = canViewProducts;
export const canViewNotifications = canViewProducts;

/** The audit trail is an administrative surface. */
export function canViewAuditLogs(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

export function canCreateBlock(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "SHOWROOM_INCHARGE" || role === "SHOWROOM_STAFF";
}

/**
 * Scope check: showroom roles may only act on blocks belonging to their own
 * showroom. Enforced server-side on every block mutation and on block reads.
 *
 * A block with no showroom (raised centrally by a Manager/Admin) is not visible
 * to showroom roles at all.
 */
export function isInScope(
  role: Role,
  opts?: { blockShowroomId?: string | null; actorShowroomId?: string | null }
): boolean {
  if (!isShowroomScoped(role)) return true;
  const blockShowroom = opts?.blockShowroomId ?? null;
  const actorShowroom = opts?.actorShowroomId ?? null;
  if (!actorShowroom) return false;
  return blockShowroom === actorShowroom;
}

export interface BlockActorContext {
  /** User.id of whoever created the block. */
  createdById?: string | null;
  /** User.id of the person attempting the action. */
  actorId?: string | null;
  /** Showroom the block belongs to. */
  blockShowroomId?: string | null;
  /** Showroom the acting user is assigned to. */
  actorShowroomId?: string | null;
}

/**
 * Approval is status-aware.
 *
 * Stage 1 (`PENDING_INCHARGE_APPROVAL`) belongs to the In-Charge of the block's
 * own showroom — a Manager may not short-circuit it (spec Flow A). Super Admin
 * retains full access. An In-Charge may never sign off on a block they raised.
 *
 * Stage 2 (`PENDING_MANAGER_APPROVAL`) is Manager / Super Admin only.
 */
export function canApproveBlock(role: Role, status: BlockStatus, opts?: BlockActorContext): boolean {
  if (READ_ONLY.includes(role)) return false;

  if (status === "PENDING_INCHARGE_APPROVAL") {
    if (role === "SUPER_ADMIN") return true;
    if (role !== "SHOWROOM_INCHARGE") return false;
    if (!isInScope(role, opts)) return false;
    // An In-Charge may not sign off on a block they raised themselves (§11).
    return !(opts?.actorId && opts.createdById && opts.actorId === opts.createdById);
  }

  if (status === "PENDING_MANAGER_APPROVAL") {
    return role === "SUPER_ADMIN" || role === "MANAGER";
  }

  return false;
}

export function canRejectBlock(role: Role, status: BlockStatus, opts?: BlockActorContext): boolean {
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

/** Legacy APPROVED rows only; new blocks reach READY_TO_SHIP on approval. */
export function canMarkReadyToShip(role: Role, status: BlockStatus): boolean {
  return (role === "SUPER_ADMIN" || role === "MANAGER") && status === "APPROVED";
}

/**
 * Creators may cancel their own block while it is still active; Managers and
 * Super Admins may cancel any active block. Showroom roles are additionally
 * limited to their own showroom.
 */
export function canCancelBlock(role: Role, status: BlockStatus, opts?: BlockActorContext): boolean {
  if (READ_ONLY.includes(role)) return false;
  if (!isActiveBlock(status)) return false;
  // Once part of the goods have shipped the hold can no longer be handed back
  // as a whole; use partial delivery/release instead.
  if (status === "PARTIALLY_SHIPPED") return false;
  if (role === "SUPER_ADMIN" || role === "MANAGER") return true;
  if (role === "SHOWROOM_INCHARGE" || role === "SHOWROOM_STAFF") {
    if (!isInScope(role, opts)) return false;
    return !!(opts?.actorId && opts.createdById && opts.actorId === opts.createdById);
  }
  return false;
}

export function canReleaseBlock(role: Role, status: BlockStatus): boolean {
  if (role !== "SUPER_ADMIN" && role !== "MANAGER") return false;
  if (status === "PARTIALLY_SHIPPED") return false;
  return isActiveBlock(status);
}

/** Manual physical-stock adjustment — administrative only. */
export function canAdjustStock(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

// ————— Bookings —————

export function canCreateBooking(role: Role): boolean {
  return canCreateBlock(role);
}

/** Approving, confirming, allocating and fulfilling bookings. */
export function canReviewBooking(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

export function canCancelBooking(role: Role): boolean {
  return !READ_ONLY.includes(role);
}

// ————— Administration (Super Admin only) —————

export function canManageProducts(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Broadcasting announcements. Super Admin always; Manager retained because the
 * existing deployment already grants it. Weaver and Showroom Staff must never send.
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
 * Application error carrying an HTTP-ish status code, so callers can map a
 * failure onto the right response without string-matching messages.
 */
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function forbidden(message = "You don't have permission to perform this action."): AppError {
  return new AppError(message, 403, "FORBIDDEN");
}

export function conflict(message: string): AppError {
  return new AppError(message, 409, "CONFLICT");
}

/**
 * Throwing guard for server-side use.
 * Call at the top of every mutating action/route.
 */
export function assertPermission(
  allowed: boolean,
  message = "You don't have permission to perform this action."
): void {
  if (!allowed) throw forbidden(message);
}
