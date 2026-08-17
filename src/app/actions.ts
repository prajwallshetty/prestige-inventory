"use server";

import { db } from "@/lib/db";
import { adjustStock } from "@/services/StockAdjustmentService";
import {
  createBlockRequest,
  approveBlock,
  releaseBlock,
  rejectBlock,
  deliverBlock,
  shipBlock,
  markBlockReadyToShip,
  cancelBlock,
} from "@/services/StockBlockService";
import {
  assertPermission,
  canCreateBlock,
  canManageDealers,
  canSendAnnouncements,
  isRole,
  ROLES,
  type Role,
} from "@/lib/permissions";
import { createShipment, receiveShipmentStock } from "@/services/ShipmentService";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  createBooking,
  reviewBooking,
  confirmBooking,
  requestBookingExtension,
  reviewExtension,
  cancelBooking,
  allocateBookingStock,
  fulfillBookingStock,
} from "@/services/BookingService";


export async function adjustStockAction(formData: FormData) {
  const productId = formData.get("productId") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const reason = formData.get("reason") as string;

  if (!productId || isNaN(quantity)) {
    throw new Error("Invalid adjustment input.");
  }

  await adjustStock({
    productId,
    adjustmentQuantity: quantity,
    reason: reason || "Manual Inventory Adjustment",
    performedBy: "Inventory Manager",
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function createBlockAction(formData: FormData) {
  const session = await getEffectiveSession();
  if (!session) {
    throw new Error("Unauthorized: Please sign in.");
  }

  assertPermission(canCreateBlock(session.role as Role), "Your role cannot create stock blocks.");

  const productId = formData.get("productId") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const remarks = formData.get("remarks") as string;
  const durationHours = parseInt((formData.get("durationHours") as string) || "48");
  const blocked_by = formData.get("blocked_by") as "SAMSHUDIN" | "SALMAN";
  const blockType = (formData.get("blockType") as "BLOCKED" | "CONFIRMED") || "BLOCKED";

  const dealerId = (formData.get("dealerId") as string) || undefined;
  const showroomId = (session.role === "SHOWROOM_STAFF" || session.role === "SHOWROOM_INCHARGE")
    ? session.showroomId
    : (formData.get("showroomId") as string) || undefined;

  // Note: the approval route is decided server-side from the creator's role —
  // it is deliberately not accepted from the form.
  await createBlockRequest({
    productId,
    quantity,
    dealerId: dealerId || undefined,
    showroomId: showroomId || undefined,
    remarks,
    durationHours,
    requestedBy: session.name,
    createdById: session.userId,
    blocked_by: blocked_by || undefined,
    blockType,
    userRole: session.role,
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function approveBlockAction(blockId: string, approvedQuantity?: number) {
  const session = await getEffectiveSession();
  if (!session) {
    throw new Error("Unauthorized to approve block requests.");
  }

  // Authority is enforced inside the service against the block's live status.
  await approveBlock({
    blockId,
    approvedBy: session.name,
    approvedById: session.userId,
    role: session.role,
    approvedQuantity,
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function rejectBlockAction(blockId: string, reason?: string) {
  const session = await getEffectiveSession();
  if (!session) {
    throw new Error("Unauthorized.");
  }

  await rejectBlock({
    blockId,
    rejectedBy: session.name,
    rejectedById: session.userId,
    role: session.role,
    reason,
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

/** APPROVED → READY_TO_SHIP (Manager / Super Admin). */
export async function markReadyToShipAction(blockId: string) {
  const session = await getEffectiveSession();
  if (!session) throw new Error("Unauthorized.");

  await markBlockReadyToShip({
    blockId,
    performedBy: session.name,
    performedById: session.userId,
    role: session.role,
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

/** READY_TO_SHIP → SHIPPED / PARTIALLY_SHIPPED (Manager / Super Admin). */
export async function shipBlockAction(blockId: string, quantity?: number) {
  const session = await getEffectiveSession();
  if (!session) throw new Error("Unauthorized.");

  await shipBlock({
    blockId,
    quantity,
    performedBy: session.name,
    performedById: session.userId,
    role: session.role,
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function deliverBlockAction(blockId: string, deliveryQty?: number) {
  const session = await getEffectiveSession();
  if (!session) {
    throw new Error("Unauthorized.");
  }

  await deliverBlock({
    blockId,
    quantity: deliveryQty,
    performedBy: session.name,
    performedById: session.userId,
    role: session.role,
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

/** Cancels an active block — creators may cancel their own, Managers any. */
export async function cancelBlockAction(blockId: string, reason?: string) {
  const session = await getEffectiveSession();
  if (!session) throw new Error("Unauthorized.");

  await cancelBlock({
    blockId,
    performedBy: session.name,
    performedById: session.userId,
    role: session.role,
    reason,
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function releaseBlockAction(blockId: string, reason?: string) {
  const session = await getEffectiveSession();
  if (!session) {
    throw new Error("Unauthorized: Please sign in.");
  }

  await releaseBlock({
    blockId,
    releasedBy: session.name,
    reason: reason || "Manual reservation release",
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}



export async function createBookingAction(input: any) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized: Please sign in.");
  }

  const finalInput = {
    ...input,
    // Dealer is always chosen explicitly now that the DEALER login role is gone.
    dealerId: input.dealerId,
    requestedBy: session.name,
  };

  const result = await createBooking(finalInput);
  revalidatePath("/bookings");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return result;
}

export async function reviewBookingAction(
  bookingId: string,
  status: "APPROVED" | "REJECTED" | "ON_HOLD",
  approvedBy: string,
  itemApprovals?: any[],
  notes?: string
) {
  const result = await reviewBooking({ bookingId, status, approvedBy, itemApprovals, notes });
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return result;
}

export async function confirmBookingAction(bookingId: string, confirmedBy: string) {
  const result = await confirmBooking({ bookingId, confirmedBy });
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return result;
}

export async function requestBookingExtensionAction(
  bookingId: string,
  extensionHours: number,
  reason: string,
  requestedBy: string
) {
  const result = await requestBookingExtension({ bookingId, extensionHours, reason, requestedBy });
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return result;
}

export async function reviewExtensionAction(
  bookingId: string,
  action: "APPROVE" | "REJECT",
  performedBy: string
) {
  const result = await reviewExtension({ bookingId, action, performedBy });
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return result;
}

export async function cancelBookingAction(bookingId: string, cancelledBy: string, reason: string) {
  const result = await cancelBooking({ bookingId, cancelledBy, reason });
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return result;
}

export async function allocateBookingStockAction(bookingId: string, allocatedBy: string) {
  const result = await allocateBookingStock({ bookingId, allocatedBy });
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return result;
}

export async function fulfillBookingStockAction(bookingId: string, fulfilledBy: string) {
  const result = await fulfillBookingStock({ bookingId, fulfilledBy });
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return result;
}

export async function getDealersAndWarehousesAction() {
  const [dealers, warehouses, showrooms, session] = await Promise.all([
    db.dealer.findMany({ select: { id: true, name: true } }),
    db.warehouse.findMany({ select: { id: true, name: true, code: true } }),
    db.showroom.findMany({ select: { id: true, name: true } }),
    getEffectiveSession(),
  ]);
  return { dealers, warehouses, showrooms, session };
}

export async function bulkApproveBookingsAction(bookingIds: string[], approvedBy: string) {
  let approved = 0;
  let failed = 0;
  let insufficientStock = 0;

  for (const id of bookingIds) {
    try {
      await reviewBooking({
        bookingId: id,
        status: "APPROVED",
        approvedBy,
      });
      approved++;
    } catch (err: any) {
      if (err.message.includes("Insufficient stock")) {
        insufficientStock++;
      } else {
        failed++;
      }
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");

  return { approved, failed, insufficientStock };
}

export async function getInventoryReportDataAction() {
  return await db.inventory.findMany({
    include: {
      product: { select: { name: true, sku: true, size: true, brand: { select: { name: true } } } },
      warehouse: { select: { name: true, code: true } },
    },
  });
}

export async function getBlocksReportDataAction() {
  return await db.stockBlock.findMany({
    include: {
      dealer: { select: { name: true } },
      inventory: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
}

export async function getBookingsReportDataAction() {
  return await db.stockBooking.findMany({
    include: {
      dealer: { select: { name: true } },
      warehouse: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
}

export async function getMovementsReportDataAction() {
  return await db.inventoryMovement.findMany({
    include: {
      inventory: { include: { product: { select: { name: true, sku: true } } } },
      warehouse: { select: { name: true } },
    },
  });
}

export async function globalSearchAction(query: string) {
  if (!query || query.trim().length < 2) {
    return { products: [], dealers: [], bookings: [], warehouses: [] };
  }

  const q = query.trim();
  const [products, dealers, bookings, warehouses] = await Promise.all([
    db.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { productCode: { contains: q, mode: "insensitive" } },
        ],
        deletedAt: null,
      },
      take: 5,
      select: { id: true, name: true, productCode: true },
    }),
    db.dealer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, name: true, company: true },
    }),
    db.stockBooking.findMany({
      where: {
        bookingNumber: { contains: q, mode: "insensitive" },
      },
      take: 5,
      select: { id: true, bookingNumber: true, status: true },
    }),
    db.warehouse.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, name: true, code: true },
    }),
  ]);

  return { products, dealers, bookings, warehouses };
}

import { comparePassword, createSession, destroySession, getSession, updateSessionPreview, hashPassword, getEffectiveSession } from "@/lib/auth";

export async function signInAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    throw new Error("Email or password is incorrect.");
  }

  if (user.status === "DEACTIVATED" || user.status === "INACTIVE") {
    throw new Error("Your account is currently inactive.");
  }

  if (user.status === "SUSPENDED") {
    throw new Error("Your account is currently suspended.");
  }

  const matches = await comparePassword(password, user.password);
  if (!matches) {
    throw new Error("Email or password is incorrect.");
  }

  // Create JWT session
  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    dealerId: user.dealer_id || undefined,
    warehouseId: user.warehouse_id || undefined,
  });

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Log to Audit Log
  await db.auditLog.create({
    data: {
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
      meta: { performedBy: user.name, details: "User signed in successfully." },
    },
  });

  // Return destination URL
  if (user.role === "SUPER_ADMIN") return "/admin/dashboard";
  if (user.role === "MANAGER") return "/warehouse/dashboard";
  if (user.role === "SHOWROOM_STAFF") return "/showroom-staff/dashboard";
  if (user.role === "SHOWROOM_INCHARGE") return "/showroom-incharge/dashboard";
  return "/viewer/dashboard"; // WEAVER (read-only) lands on the viewer dashboard
}

export async function signOutAction() {
  const session = await getSession();
  if (session) {
    await db.auditLog.create({
      data: {
        action: "LOGOUT",
        entity: "User",
        entityId: session.userId,
        meta: { performedBy: session.name, details: "User logged out." },
      },
    });
  }

  await destroySession();
}

export async function setSimulatedSessionAction(role: any, dealerId?: string, warehouseId?: string, showroomId?: string) {
  const session = await getSession();
  // Safe Preview Mode: Only Super Admin can change their preview/simulated role
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized: Role switching is Super Admin only.");
  }

  await updateSessionPreview(role === "SUPER_ADMIN" ? undefined : role);
  
  const cookieStore = await cookies();
  if (dealerId) {
    cookieStore.set("prestige_dealer_id", dealerId, { path: "/" });
  } else {
    cookieStore.delete("prestige_dealer_id");
  }
  if (warehouseId) {
    cookieStore.set("prestige_warehouse_id", warehouseId, { path: "/" });
  } else {
    cookieStore.delete("prestige_warehouse_id");
  }
  if (showroomId) {
    cookieStore.set("prestige_showroom_id", showroomId, { path: "/" });
  } else {
    cookieStore.delete("prestige_showroom_id");
  }

  revalidatePath("/", "layout");
}

export async function createUserAction(payload: any) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized: User management is restricted to Super Admin.");
  }

  const { name, email, password, role, dealer_id, warehouse_id, showroom_id, status } = payload;

  if (!name || !email || !password || !role) {
    throw new Error("Missing required fields.");
  }

  // Only the five Phase 1 roles may ever be assigned (spec §25).
  if (!isRole(role)) {
    throw new Error(`Invalid role "${role}". Allowed roles: ${ROLES.join(", ")}.`);
  }
  if (role === "MANAGER" && !warehouse_id) {
    throw new Error("Role MANAGER requires assigning a warehouse.");
  }
  if ((role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") && !showroom_id) {
    throw new Error("Role showroom staff/in-charge requires assigning a showroom.");
  }

  const existingUser = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existingUser) {
    throw new Error("Email address already registered.");
  }

  const hashedPassword = await hashPassword(password);

  const newUser = await db.user.create({
    data: {
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
      dealer_id: null, // DEALER role retired in Phase 1
      warehouse_id: role === "MANAGER" ? warehouse_id : null,
      showroomId: (role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") ? showroom_id : null,
      status: status || "ACTIVE",
    },
  });

  await db.auditLog.create({
    data: {
      action: "USER_CREATE",
      entity: "User",
      entityId: newUser.id,
      meta: { performedBy: session.name, details: `Created user ${newUser.name} with role ${newUser.role}.` },
    },
  });

  revalidatePath("/admin/users");
  return newUser;
}

export async function updateUserAction(userId: string, payload: any) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized: User management is restricted to Super Admin.");
  }

  const { name, email, password, role, dealer_id, warehouse_id, showroom_id, status } = payload;

  // Only the five Phase 1 roles may ever be assigned (spec §25).
  if (!isRole(role)) {
    throw new Error(`Invalid role "${role}". Allowed roles: ${ROLES.join(", ")}.`);
  }
  if (role === "MANAGER" && !warehouse_id) {
    throw new Error("Role MANAGER requires assigning a warehouse.");
  }
  if ((role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") && !showroom_id) {
    throw new Error("Role showroom staff/in-charge requires assigning a showroom.");
  }

  const updateData: any = {
    name,
    email: email?.toLowerCase().trim(),
    role,
    dealer_id: null, // DEALER role retired in Phase 1
    warehouse_id: role === "MANAGER" ? warehouse_id : null,
    showroomId: (role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") ? showroom_id : null,
    status,
  };

  if (password) {
    updateData.password = await hashPassword(password);
  }

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: updateData,
  });

  await db.auditLog.create({
    data: {
      action: "USER_UPDATE",
      entity: "User",
      entityId: updatedUser.id,
      meta: { performedBy: session.name, details: `Updated user ${updatedUser.name} config.` },
    },
  });

  revalidatePath("/admin/users");
  return updatedUser;
}

export async function deactivateUserAction(userId: string, status: "DEACTIVATED" | "SUSPENDED" | "ACTIVE") {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized: User management is restricted to Super Admin.");
  }

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: { status },
  });

  await db.auditLog.create({
    data: {
      action: `USER_STATUS_${status}`,
      entity: "User",
      entityId: updatedUser.id,
      meta: { performedBy: session.name, details: `Updated user ${updatedUser.name} status to ${status}.` },
    },
  });

  revalidatePath("/admin/users");
  return updatedUser;
}

export async function getNotificationsAction(limit = 20) {
  const { getNotifications } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session) return [];
  return await getNotifications(session.userId, limit);
}

export async function getUnreadCountAction() {
  const { getUnreadCount } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session) return 0;
  return await getUnreadCount(session.userId);
}

export async function markNotificationAsReadAction(id: string) {
  const { markNotificationAsRead } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session) throw new Error("Unauthorized.");
  return await markNotificationAsRead(session.userId, id);
}

export async function markAllNotificationsAsReadAction() {
  const { markAllNotificationsAsRead } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session) throw new Error("Unauthorized.");
  await markAllNotificationsAsRead(session.userId);
}

export async function deleteNotificationAction(id: string) {
  const { deleteNotification } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session) throw new Error("Unauthorized.");
  await deleteNotification(session.userId, id);
}

export async function broadcastAnnouncementAction(payload: {
  title: string;
  message: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  audienceType: string;
  audienceFilter?: string | null;
  /** ISO strings from the composer; empty/absent means send now / never expire. */
  scheduledAt?: string | null;
  expiresAt?: string | null;
}) {
  const { createAnnouncement } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "MANAGER")) {
    throw new Error("Unauthorized: Only Super Admin and Managers can broadcast announcements.");
  }

  const { scheduledAt, expiresAt, ...rest } = payload;
  const scheduled = scheduledAt ? new Date(scheduledAt) : null;
  const expires = expiresAt ? new Date(expiresAt) : null;

  if (scheduled && Number.isNaN(scheduled.getTime())) throw new Error("Invalid schedule date.");
  if (expires && Number.isNaN(expires.getTime())) throw new Error("Invalid expiry date.");
  if (scheduled && expires && expires <= scheduled) {
    throw new Error("Expiry must be after the scheduled send time.");
  }

  const result = await createAnnouncement({
    createdById: session.userId,
    ...rest,
    scheduledAt: scheduled,
    expiresAt: expires,
  });
  revalidatePath("/admin/announcements");
  revalidatePath("/warehouse/announcements");
  return result;
}

export async function getAnnouncementsHistoryAction(limit = 20) {
  const { getAnnouncementsHistory } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "MANAGER")) {
    return [];
  }
  return await getAnnouncementsHistory(limit);
}


// ————— Dealer management (Phase 2) — Super Admin only —————

/** Guard shared by every dealer mutation. */
async function requireSuperAdmin(what: string) {
  const session = await getEffectiveSession();
  if (!session) throw new Error("Unauthorized: Please sign in.");
  assertPermission(canManageDealers(session.role as Role), `Unauthorized: ${what} is restricted to Super Admin.`);
  return session;
}

export async function createDealerAction(payload: {
  name: string;
  dealerCode: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  company?: string;
  showroomId?: string;
  status?: "ACTIVE" | "INACTIVE";
}) {
  const session = await requireSuperAdmin("dealer management");
  const { createDealer } = await import("@/services/DealerService");

  const dealer = await createDealer({
    ...payload,
    createdById: session.userId,
    createdByName: session.name,
  });

  revalidatePath("/admin/dealers");
  revalidatePath("/dealers");
  return { id: dealer.id, dealerId: dealer.dealerId };
}

export async function updateDealerAction(id: string, payload: {
  name?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  company?: string;
  showroomId?: string;
  status?: "ACTIVE" | "INACTIVE";
}) {
  const session = await requireSuperAdmin("dealer management");
  const { updateDealer } = await import("@/services/DealerService");

  await updateDealer({ ...payload, id, updatedById: session.userId, updatedByName: session.name });

  revalidatePath("/admin/dealers");
  revalidatePath("/dealers");
}

export async function setDealerStatusAction(id: string, status: "ACTIVE" | "INACTIVE") {
  const session = await requireSuperAdmin("dealer management");
  const { setDealerStatus } = await import("@/services/DealerService");

  await setDealerStatus({ id, status, performedById: session.userId, performedByName: session.name });

  revalidatePath("/admin/dealers");
  revalidatePath("/dealers");
}

export async function getDealerDetailAction(id: string) {
  await requireSuperAdmin("dealer management");
  const { getDealerDetail } = await import("@/services/DealerService");
  return getDealerDetail(id);
}
