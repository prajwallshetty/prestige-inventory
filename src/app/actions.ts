"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

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
  createLogisticsTransitRecord,
  createLogisticsShipmentRecord,
  updateLogisticsRecord,
  deleteLogisticsRecord,
} from "@/services/StockBlockService";
import {
  createPurchaseOrder,
  advanceProcurementStatus,
  receiveProcurement,
} from "@/services/ProcurementService";
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

import {
  AppError,
  assertPermission,
  canAdjustStock,
  canCancelBooking,
  canCreateBlock,
  canCreateBooking,
  canManageDealers,
  canManageWarehouses,
  canManageShowrooms,
  canReviewBooking,
  canViewAuditLogs,
  isRole,
  isShowroomScoped,
  ROLES,
  type Role,
} from "@/lib/permissions";
import {
  comparePassword,
  createSession,
  destroySession,
  getSession,
  getEffectiveSession,
  hashPassword,
  requireUser,
  updateSessionPreview,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { generateUniqueLoginCode } from "@/lib/loginCode";
import { checkLoginRateLimit, recordFailedLoginAttempt, clearLoginRateLimit } from "@/lib/rateLimit";
import {
  ActionResult,
  fail,
  ok,
  revalidateBlockViews,
  revalidateBookingViews,
  revalidateProcurementViews,
  runAction,
} from "@/lib/action-result";

// ————————————————————————————————————————————————
// Stock adjustment
// ————————————————————————————————————————————————

export async function adjustStockAction(formData: FormData): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    // Physical stock corrections are administrative — the previous version had
    // no session check at all and attributed every change to "Inventory Manager".
    assertPermission(canAdjustStock(user.role), "Only a Super Admin can adjust physical stock.");

    const productId = formData.get("productId") as string;
    const quantity = parseFloat(formData.get("quantity") as string);
    const reason = (formData.get("reason") as string) || "";

    if (!productId) throw new AppError("Select a product to adjust.", 400, "VALIDATION");
    if (!Number.isFinite(quantity) || quantity === 0) {
      throw new AppError("Enter a non-zero adjustment quantity.", 400, "VALIDATION");
    }
    if (!reason.trim()) {
      throw new AppError("A reason is required for every stock adjustment.", 400, "VALIDATION");
    }

    await adjustStock({
      productId,
      adjustmentQuantity: quantity,
      reason: reason.trim(),
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews();
    return undefined;
  });
}

// ————————————————————————————————————————————————
// All Stock CRUD Actions (Super Admin & Manager)
// ————————————————————————————————————————————————

export async function createStockItemAction(payload: {
  name: string;
  sku?: string;
  productCode?: string;
  brandId?: string;
  categoryId?: string;
  productTypeId?: string;
  collectionId?: string;
  size?: string;
  finish?: string;
  surface?: string;
  color?: string;
  material?: string;
  price?: number;
  mrp?: number;
  description?: string;
  images?: string[];
  image_key?: string;
  thumbnail_key?: string;
  lifestyleImage?: string;
  totalStock?: number;
  looseStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  reorderLevel?: number;
  warehouseId?: string;
  remarks?: string;
}): Promise<ActionResult<{ productId: string; inventoryId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
      throw new AppError("Only Super Admin or Manager can create new stock items.", 403, "FORBIDDEN");
    }

    const { createStockProductItem } = await import("@/services/InventoryService");
    const res = await createStockProductItem({
      ...payload,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews();
    return { productId: res.product.id, inventoryId: res.inventory.id };
  });
}

export async function updateStockItemAction(
  productId: string,
  payload: {
    name?: string;
    sku?: string;
    productCode?: string;
    brandId?: string;
    categoryId?: string;
    productTypeId?: string;
    collectionId?: string;
    size?: string;
    finish?: string;
    surface?: string;
    color?: string;
    material?: string;
    price?: number;
    mrp?: number;
    description?: string;
    images?: string[];
    image_key?: string;
    thumbnail_key?: string;
    lifestyleImage?: string;
    totalStock?: number;
    looseStock?: number;
    minimumStock?: number;
    maximumStock?: number;
    reorderLevel?: number;
    warehouseId?: string;
    remarks?: string;
  }
): Promise<ActionResult<{ productId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
      throw new AppError("Only Super Admin or Manager can edit stock items.", 403, "FORBIDDEN");
    }

    const { updateStockProductItem } = await import("@/services/InventoryService");
    const res = await updateStockProductItem({
      productId,
      ...payload,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews();
    return { productId: res.product.id };
  });
}

export async function deleteStockItemAction(
  productId: string,
  reason?: string
): Promise<ActionResult<{ success: boolean }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (user.actualRole !== "SUPER_ADMIN") {
      throw new AppError("Only Super Admin can delete stock items.", 403, "FORBIDDEN");
    }

    const { deleteStockProductItem } = await import("@/services/InventoryService");
    const res = await deleteStockProductItem({
      productId,
      reason,
      performedBy: user.name,
      performedById: user.userId,
      role: user.actualRole,
    });

    revalidateBlockViews();
    return { success: res.success };
  });
}

// ————————————————————————————————————————————————
// Block lifecycle
// ————————————————————————————————————————————————

/** Showroom users are pinned to their own showroom; the client cannot choose. */
function scopedShowroomId(user: { role: Role; showroomId: string | null }, requested?: string | null) {
  if (user.role === "SHOWROOM_STAFF" || user.role === "SHOWROOM_INCHARGE") {
    return user.showroomId || undefined;
  }
  return requested || undefined;
}

export async function createBlockAction(formData: FormData): Promise<ActionResult<{ id: string; blockNumber: string | null }>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canCreateBlock(user.role), "Your role cannot create stock blocks.");

    const productId = formData.get("productId") as string;
    const quantity = parseFloat(formData.get("quantity") as string);
    const remarks = (formData.get("remarks") as string) || undefined;
    const durationHours = parseInt((formData.get("durationHours") as string) || "48");
    const blocked_by = (formData.get("blocked_by") as "SAMSHUDIN" | "SALMAN") || undefined;
    const blockType = ((formData.get("blockType") as string) || "BLOCKED") as "BLOCKED" | "CONFIRMED";
    const dealerId = (formData.get("dealerId") as string) || undefined;

    const block = await createBlockRequest({
      productId,
      quantity,
      dealerId,
      showroomId: scopedShowroomId(user, formData.get("showroomId") as string),
      remarks,
      durationHours,
      requestedBy: user.name,
      createdById: user.userId,
      blocked_by,
      blockType,
      userRole: user.role,
    });

    revalidateBlockViews(block.id);
    return { id: block.id, blockNumber: block.block_number };
  });
}

/**
 * Creates a block from the booking form.
 *
 * Scope (showroom) is taken from the session, never from the client (spec §36).
 */
export async function createBlockFromFormAction(input: {
  productId: string;
  quantity: number;
  dealerId?: string;
  remarks?: string;
  durationHours?: number;
}): Promise<ActionResult<{ id: string; blockNumber: string | null; status: string; quantity: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canCreateBlock(user.role), "Your role cannot create stock blocks.");

    const block = await createBlockRequest({
      productId: input.productId,
      quantity: input.quantity,
      dealerId: input.dealerId || undefined,
      showroomId: scopedShowroomId(user),
      remarks: input.remarks,
      durationHours: input.durationHours ?? 48,
      requestedBy: user.name,
      createdById: user.userId,
      userRole: user.role,
    });

    revalidateBlockViews(block.id);
    return {
      id: block.id,
      blockNumber: block.block_number,
      status: block.status,
      quantity: block.quantity,
    };
  });
}

/**
 * Multi-product order creation — one submission, many product/quantity
 * lines, created atomically as a BlockOrder + its StockBlock line items.
 */
export async function createMultiProductBlockAction(input: {
  items: Array<{ productId: string; quantity: number }>;
  dealerId?: string;
  remarks?: string;
  durationHours?: number;
}): Promise<ActionResult<{ orderId: string; orderNumber: string; itemCount: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canCreateBlock(user.role), "Your role cannot create stock blocks.");

    const { createMultiProductBlockRequest } = await import("@/services/BlockOrderService");
    const result = await createMultiProductBlockRequest({
      items: input.items,
      dealerId: input.dealerId || undefined,
      showroomId: scopedShowroomId(user),
      remarks: input.remarks,
      durationHours: input.durationHours ?? 48,
      requestedBy: user.name,
      createdById: user.userId,
      userRole: user.role,
    });

    revalidateBlockViews();
    return { orderId: result.order.id, orderNumber: result.order.orderNumber, itemCount: result.items.length };
  });
}

export interface OrderItemActionOutcome {
  blockId: string;
  blockNumber: string | null;
  ok: boolean;
  error?: string;
}

export async function approveBlockOrderAction(
  orderId: string
): Promise<ActionResult<{ orderNumber: string; results: OrderItemActionOutcome[] }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { approveBlockOrder } = await import("@/services/BlockOrderService");
    const { order, results } = await approveBlockOrder({
      orderId,
      approvedBy: user.name,
      approvedById: user.userId,
      role: user.role,
      actorShowroomId: user.showroomId,
    });

    revalidateBlockViews();
    return { orderNumber: order.orderNumber, results };
  });
}

export async function rejectBlockOrderAction(
  orderId: string,
  reason: string
): Promise<ActionResult<{ orderNumber: string; results: OrderItemActionOutcome[] }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { rejectBlockOrder } = await import("@/services/BlockOrderService");
    const { order, results } = await rejectBlockOrder({
      orderId,
      rejectedBy: user.name,
      rejectedById: user.userId,
      role: user.role,
      actorShowroomId: user.showroomId,
      reason,
    });

    revalidateBlockViews();
    return { orderNumber: order.orderNumber, results };
  });
}

export async function cancelBlockOrderAction(
  orderId: string,
  reason?: string
): Promise<ActionResult<{ orderNumber: string; results: OrderItemActionOutcome[] }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { cancelBlockOrder } = await import("@/services/BlockOrderService");
    const { order, results } = await cancelBlockOrder({
      orderId,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
      actorShowroomId: user.showroomId,
      reason,
    });

    revalidateBlockViews();
    return { orderNumber: order.orderNumber, results };
  });
}

export async function approveBlockAction(
  blockId: string,
  approvedQuantity?: number
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    // Authority, scope and transition legality are all enforced in the service
    // against the block's live, row-locked status.
    const block = await approveBlock({
      blockId,
      approvedBy: user.name,
      approvedById: user.userId,
      role: user.role,
      actorShowroomId: user.showroomId,
      approvedQuantity,
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

export async function rejectBlockAction(
  blockId: string,
  reason?: string
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const block = await rejectBlock({
      blockId,
      rejectedBy: user.name,
      rejectedById: user.userId,
      role: user.role,
      actorShowroomId: user.showroomId,
      reason,
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

/** Legacy APPROVED → READY_TO_SHIP (Manager / Super Admin). */
export async function markReadyToShipAction(blockId: string): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const block = await markBlockReadyToShip({
      blockId,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

/** READY_TO_SHIP → SHIPPED / PARTIALLY_SHIPPED (Manager / Super Admin). */
export async function shipBlockAction(
  blockId: string,
  quantity?: number,
  vehicle?: {
    vehicleNumber?: string;
    driverName?: string;
    driverPhone?: string;
    transporter?: string;
    expectedDeliveryAt?: string;
  }
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const block = await shipBlock({
      blockId,
      quantity,
      vehicleNumber: vehicle?.vehicleNumber,
      driverName: vehicle?.driverName,
      driverPhone: vehicle?.driverPhone,
      transporter: vehicle?.transporter,
      expectedDeliveryAt: vehicle?.expectedDeliveryAt ? new Date(vehicle.expectedDeliveryAt) : undefined,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

export async function deliverBlockAction(
  blockId: string,
  deliveryQty?: number
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const block = await deliverBlock({
      blockId,
      quantity: deliveryQty,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

/** Cancels an active block — creators may cancel their own, Managers any. */
export async function cancelBlockAction(
  blockId: string,
  reason?: string
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const block = await cancelBlock({
      blockId,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
      actorShowroomId: user.showroomId,
      reason,
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

export async function releaseBlockAction(
  blockId: string,
  reason?: string
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    // The role is passed through so the service can authorise. It previously
    // defaulted to SUPER_ADMIN, letting any signed-in user release any hold.
    const block = await releaseBlock({
      blockId,
      releasedBy: user.name,
      releasedById: user.userId,
      role: user.role,
      reason: reason || "Manual reservation release",
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

// ————————————————————————————————————————————————
// Super Admin Logistics & Transit Management
// ————————————————————————————————————————————————

export async function createLogisticsTransitAction(payload: {
  productId: string;
  quantity: number;
  warehouseId?: string;
  dealerId?: string;
  showroomId?: string;
  vehicleNumber: string;
  driverName?: string;
  driverPhone?: string;
  transporter?: string;
  expectedDeliveryAt?: string;
  remarks?: string;
}): Promise<ActionResult<{ id: string; blockNumber: string | null }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
      throw new AppError("Only Super Admin or Manager can create transit dispatches.", 403, "FORBIDDEN");
    }

    const block = await createLogisticsTransitRecord({
      ...payload,
      expectedDeliveryAt: payload.expectedDeliveryAt ? new Date(payload.expectedDeliveryAt) : undefined,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews(block.id);
    return { id: block.id, blockNumber: block.block_number };
  });
}

export async function createLogisticsShipmentAction(payload: {
  productId: string;
  quantity: number;
  warehouseId?: string;
  dealerId?: string;
  showroomId?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  transporter?: string;
  deliveredAt?: string;
  remarks?: string;
}): Promise<ActionResult<{ id: string; blockNumber: string | null }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
      throw new AppError("Only Super Admin or Manager can record delivered shipments.", 403, "FORBIDDEN");
    }

    const block = await createLogisticsShipmentRecord({
      ...payload,
      deliveredAt: payload.deliveredAt ? new Date(payload.deliveredAt) : undefined,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews(block.id);
    return { id: block.id, blockNumber: block.block_number };
  });
}

export async function updateLogisticsRecordAction(
  blockId: string,
  payload: {
    vehicleNumber?: string;
    driverName?: string;
    driverPhone?: string;
    transporter?: string;
    expectedDeliveryAt?: string;
    status?: string;
    remarks?: string;
  }
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
      throw new AppError("Only Super Admin or Manager can edit logistics records.", 403, "FORBIDDEN");
    }

    const block = await updateLogisticsRecord({
      blockId,
      ...payload,
      expectedDeliveryAt: payload.expectedDeliveryAt ? new Date(payload.expectedDeliveryAt) : undefined,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateBlockViews(block.id);
    return { status: block.status };
  });
}

export async function deleteLogisticsRecordAction(
  blockId: string,
  reason?: string
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (user.actualRole !== "SUPER_ADMIN") {
      throw new AppError("Only Super Admin can delete logistics records.", 403, "FORBIDDEN");
    }

    const block = await deleteLogisticsRecord({
      blockId,
      reason,
      performedBy: user.name,
      performedById: user.userId,
      role: user.actualRole,
    });

    revalidateBlockViews(blockId);
    return { status: block.status };
  });
}

// ————————————————————————————————————————————————
// Procurement ("Need to Order") — overstock spec
//
// Reads (Need to Order list, dashboard summary, purchase-order list) are
// server-rendered straight from the service layer in each page.tsx, the same
// pattern /blocks and /shipments already use — filters travel as URL search
// params rather than a client-invoked action. Only mutations live here.
// ————————————————————————————————————————————————

export async function createPurchaseOrderAction(input: {
  blockIds: string[];
  supplier?: string;
  purchaseReference?: string;
  expectedDate?: string;
  warehouseId?: string;
  remarks?: string;
}): Promise<ActionResult<{ id: string; shipmentNumber: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const shipment = await createPurchaseOrder({
      blockIds: input.blockIds,
      supplier: input.supplier,
      purchaseReference: input.purchaseReference,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      warehouseId: input.warehouseId,
      remarks: input.remarks,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateProcurementViews(shipment.id);
    return { id: shipment.id, shipmentNumber: shipment.shipmentNumber };
  });
}

export async function advanceProcurementStatusAction(
  shipmentId: string,
  status: "DISPATCHED" | "IN_TRANSIT" | "ARRIVED" | "CANCELLED"
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const updated = await advanceProcurementStatus({
      shipmentId,
      status,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateProcurementViews(shipmentId);
    return { status: updated.status };
  });
}

export async function receiveProcurementAction(input: {
  shipmentId: string;
  receivedItems: Array<{ shipmentItemId: string; receivedQuantity: number; damagedQuantity: number }>;
}): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const updated = await receiveProcurement({
      shipmentId: input.shipmentId,
      receivedItems: input.receivedItems,
      performedBy: user.name,
      performedById: user.userId,
      role: user.role,
    });

    revalidateProcurementViews(input.shipmentId);
    revalidateBlockViews();
    return { status: updated.status };
  });
}

// ————————————————————————————————————————————————
// Block creation support
// ————————————————————————————————————————————————

/** Server-side product search for the block form's picker (spec §7, §19). */
export async function searchBlockableProductsAction(query: string) {
  const session = await getEffectiveSession();
  if (!session) return [];
  const { searchBlockableProducts } = await import("@/services/InventoryService");
  return searchBlockableProducts({ query, limit: 10 });
}

/** Live blockable quantity for one product, straight from the database. */
export async function getAvailableToBlockAction(productId: string): Promise<number> {
  const session = await getEffectiveSession();
  if (!session) return 0;
  const { getAvailableToBlock } = await import("@/services/InventoryService");
  return getAvailableToBlock(productId);
}

export async function getDealersAndWarehousesAction() {
  const session = await getEffectiveSession();
  if (!session) return { dealers: [], warehouses: [], showrooms: [], session: null };

  const [dealers, warehouses, showrooms] = await Promise.all([
    db.dealer.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, dealerId: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.warehouse.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    db.showroom.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return { dealers, warehouses, showrooms, session };
}

// ————————————————————————————————————————————————
// Bookings
// ————————————————————————————————————————————————

export async function createBookingAction(input: any): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canCreateBooking(user.role), "Your role cannot create bookings.");

    const result = await createBooking({
      ...input,
      dealerId: input.dealerId,
      // The actor is taken from the session; it used to arrive from the client.
      requestedBy: user.name,
    });

    revalidateBookingViews();
    return result;
  });
}

export async function reviewBookingAction(
  bookingId: string,
  status: "APPROVED" | "REJECTED" | "ON_HOLD",
  _legacyApprovedBy?: string,
  itemApprovals?: any[],
  notes?: string
): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canReviewBooking(user.role), "Only a Manager or Super Admin can review bookings.");

    const result = await reviewBooking({
      bookingId,
      status,
      approvedBy: user.name,
      itemApprovals,
      notes,
    });

    revalidateBookingViews(bookingId);
    return result;
  });
}

export async function confirmBookingAction(bookingId: string): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canReviewBooking(user.role), "Only a Manager or Super Admin can confirm bookings.");

    const result = await confirmBooking({ bookingId, confirmedBy: user.name });
    revalidateBookingViews(bookingId);
    return result;
  });
}

export async function requestBookingExtensionAction(
  bookingId: string,
  extensionHours: number,
  reason: string
): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canCreateBooking(user.role), "Your role cannot request an extension.");

    const result = await requestBookingExtension({
      bookingId,
      extensionHours,
      reason,
      requestedBy: user.name,
    });
    revalidateBookingViews(bookingId);
    return result;
  });
}

export async function reviewExtensionAction(
  bookingId: string,
  action: "APPROVE" | "REJECT"
): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canReviewBooking(user.role), "Only a Manager or Super Admin can review extensions.");

    const result = await reviewExtension({ bookingId, action, performedBy: user.name });
    revalidateBookingViews(bookingId);
    return result;
  });
}

export async function cancelBookingAction(
  bookingId: string,
  _legacyCancelledBy: string | undefined,
  reason: string
): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canCancelBooking(user.role), "Your role cannot cancel bookings.");

    const result = await cancelBooking({ bookingId, cancelledBy: user.name, reason });
    revalidateBookingViews(bookingId);
    return result;
  });
}

export async function allocateBookingStockAction(bookingId: string): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canReviewBooking(user.role), "Only a Manager or Super Admin can allocate stock.");

    const result = await allocateBookingStock({ bookingId, allocatedBy: user.name });
    revalidateBookingViews(bookingId);
    return result;
  });
}

export async function fulfillBookingStockAction(bookingId: string): Promise<ActionResult<any>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canReviewBooking(user.role), "Only a Manager or Super Admin can fulfil bookings.");

    const result = await fulfillBookingStock({ bookingId, fulfilledBy: user.name });
    revalidateBookingViews(bookingId);
    return result;
  });
}

export async function bulkApproveBookingsAction(
  bookingIds: string[]
): Promise<ActionResult<{ approved: number; failed: number; insufficientStock: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canReviewBooking(user.role), "Only a Manager or Super Admin can approve bookings.");

    let approved = 0;
    let failed = 0;
    let insufficientStock = 0;

    for (const id of bookingIds.slice(0, 100)) {
      try {
        await reviewBooking({ bookingId: id, status: "APPROVED", approvedBy: user.name });
        approved++;
      } catch (err: any) {
        if (/insufficient stock/i.test(err?.message ?? "")) insufficientStock++;
        else failed++;
      }
    }

    revalidateBookingViews();
    return { approved, failed, insufficientStock };
  });
}

// ————————————————————————————————————————————————
// Reports (read-only, but not public)
// ————————————————————————————————————————————————

async function requireReportAccess() {
  const session = await getEffectiveSession();
  if (!session) throw new AppError("Please sign in to continue.", 401, "UNAUTHENTICATED");
  return session;
}

export async function getInventoryReportDataAction() {
  await requireReportAccess();
  return db.inventory.findMany({
    select: {
      id: true,
      totalStock: true,
      availableStock: true,
      blockedStock: true,
      transitStock: true,
      damagedStock: true,
      stockStatus: true,
      product: { select: { name: true, sku: true, size: true, brand: { select: { name: true } } } },
      warehouse: { select: { name: true, code: true } },
    },
    take: 5000,
  });
}

export async function getBlocksReportDataAction() {
  const session = await requireReportAccess();
  // Route audit finding: this export bypassed the showroom scoping every
  // other block view enforces (blockScopeClause), letting a showroom
  // role CSV-export blocks from every showroom. Same scope rule as the
  // /blocks list.
  const where = isShowroomScoped(session.role as Role) ? { showroomId: session.showroomId ?? "__none__" } : {};
  return db.stockBlock.findMany({
    where,
    select: {
      id: true,
      block_number: true,
      status: true,
      quantity: true,
      shippedQuantity: true,
      deliveredQuantity: true,
      requestedBy: true,
      createdAt: true,
      expiresAt: true,
      dealer: { select: { name: true, dealerId: true } },
      showroom: { select: { name: true } },
      inventory: { select: { product: { select: { name: true, sku: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
}

export async function getBookingsReportDataAction() {
  const session = await requireReportAccess();
  // Same scope rule the /bookings list uses (BookingService keys showroom
  // roles off requestedBy, since StockBooking has no showroomId column).
  const where = isShowroomScoped(session.role as Role) ? { requestedBy: session.name } : {};
  return db.stockBooking.findMany({
    where,
    include: {
      dealer: { select: { name: true } },
      warehouse: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
}

export async function getMovementsReportDataAction() {
  const session = await requireReportAccess();
  // Raw stock movements aren't shown per-showroom anywhere in the app (they
  // carry no showroomId), so rather than a partial/approximate scope this
  // export is restricted to the same roles that can already see the audit
  // trail — a showroom role has no scoped view to fall back to here.
  assertPermission(canViewAuditLogs(session.role as Role), "Only a Manager or Super Admin can export stock movements.");
  return db.inventoryMovement.findMany({
    select: {
      id: true,
      movementType: true,
      quantity: true,
      previousQuantity: true,
      newQuantity: true,
      reason: true,
      performedBy: true,
      createdAt: true,
      inventory: { select: { product: { select: { name: true, sku: true } } } },
      warehouse: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
}

// ————————————————————————————————————————————————
// Global search (spec §18–§20)
// ————————————————————————————————————————————————

export interface GlobalSearchResults {
  products: Array<{
    id: string;
    name: string;
    productNumber: string;
    size: string | null;
    brand: string | null;
    thumbnailKey: string | null;
    availableStock: number;
  }>;
  blocks: Array<{
    id: string;
    blockNumber: string | null;
    status: string;
    quantity: number;
    dealer: string | null;
    product: string | null;
  }>;
  dealers: Array<{ id: string; name: string; dealerId: string | null; company: string | null }>;
  showrooms: Array<{ id: string; name: string; city: string | null }>;
}

const EMPTY_SEARCH: GlobalSearchResults = { products: [], blocks: [], dealers: [], showrooms: [] };

/**
 * One query per entity, each capped and selecting only rendered columns.
 * Scoped to the caller: a showroom user never sees another showroom's blocks.
 */
export async function globalSearchAction(query: string): Promise<GlobalSearchResults> {
  const session = await getEffectiveSession();
  if (!session) return EMPTY_SEARCH;

  const q = (query || "").trim();
  if (q.length < 2) return EMPTY_SEARCH;

  const { productSearchClause } = await import("@/services/InventoryService");
  const productClause = productSearchClause(q);
  const like = { contains: q, mode: "insensitive" as const };
  const role = session.role as Role;
  const showroomScoped = role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE";
  const blockScope = showroomScoped ? { showroomId: session.showroomId ?? "__none__" } : {};

  const [products, blocks, dealers, showrooms] = await Promise.all([
    db.product.findMany({
      where: {
        deletedAt: null,
        ...(productClause && productClause.length > 0 ? { AND: productClause } : {}),
      },
      take: 6,
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
        inventory: {
          select: { totalStock: true, blockedStock: true, allocatedStock: true, damagedStock: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.stockBlock.findMany({
      where: {
        AND: [
          blockScope,
          {
            OR: [
              { block_number: like },
              { requestedBy: like },
              { dealer: { is: { name: like } } },
              { dealer: { is: { dealerId: like } } },
              { inventory: { is: { product: { is: { name: like } } } } },
              { inventory: { is: { product: { is: { sku: like } } } } },
              { inventory: { is: { product: { is: { productCode: like } } } } },
            ],
          },
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        block_number: true,
        status: true,
        quantity: true,
        dealer: { select: { name: true } },
        inventory: { select: { product: { select: { name: true } } } },
      },
    }),
    db.dealer.findMany({
      where: { OR: [{ name: like }, { company: like }, { dealerId: like }, { phone: like }] },
      take: 5,
      select: { id: true, name: true, dealerId: true, company: true },
      orderBy: { name: "asc" },
    }),
    db.showroom.findMany({
      where: { deletedAt: null, OR: [{ name: like }, { city: like }] },
      take: 4,
      select: { id: true, name: true, city: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      productNumber: p.sku || p.productCode || p.importKey || "—",
      size: p.size,
      brand: p.brand?.name ?? null,
      thumbnailKey: p.thumbnail_key || p.image_key || null,
      availableStock: p.inventory
        ? Math.max(
            0,
            p.inventory.totalStock -
              p.inventory.blockedStock -
              p.inventory.allocatedStock -
              p.inventory.damagedStock
          )
        : 0,
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      blockNumber: b.block_number,
      status: b.status,
      quantity: b.quantity,
      dealer: b.dealer?.name ?? null,
      product: b.inventory?.product?.name ?? null,
    })),
    dealers,
    showrooms,
  };
}

// ————————————————————————————————————————————————
// Authentication
// ————————————————————————————————————————————————

export async function signInAction(formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const rawCode = (formData.get("loginCode") as string) || (formData.get("email") as string);
    const loginCode = String(rawCode || "").trim().toUpperCase();

    if (!loginCode) {
      throw new AppError("Login code is required.", 400, "VALIDATION");
    }

    // Rate limiting guard against brute-force attacks (spec §12, §13)
    const rateCheck = checkLoginRateLimit(loginCode);
    if (!rateCheck.allowed) {
      const remainingSec = Math.ceil((rateCheck.remainingMs || 300000) / 1000);
      throw new AppError(
        `Too many failed login attempts. Please wait ${remainingSec} seconds before trying again.`,
        429,
        "RATE_LIMITED"
      );
    }

    // Lookup active user by unique loginCode or email
    const user = await db.user.findFirst({
      where: {
        OR: [
          { loginCode },
          { email: loginCode.toLowerCase() },
        ],
      },
    });

    if (!user) {
      recordFailedLoginAttempt(loginCode);
      throw new AppError("Invalid login code.", 401, "BAD_CREDENTIALS");
    }

    if (user.status === "DEACTIVATED" || user.status === "INACTIVE") {
      throw new AppError("Your account is currently inactive. Access denied.", 403, "ACCOUNT_INACTIVE");
    }
    if (user.status === "SUSPENDED") {
      throw new AppError("Your account is currently suspended. Contact Super Admin.", 403, "ACCOUNT_SUSPENDED");
    }

    clearLoginRateLimit(loginCode);

    if (!isRole(user.role)) {
      throw new AppError("Your account has an invalid role. Contact an administrator.", 403, "BAD_ROLE");
    }

    await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      dealerId: user.dealer_id || undefined,
      warehouseId: user.warehouse_id || undefined,
      showroomId: user.showroomId || undefined,
    });

    await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    await db.auditLog.create({
      data: {
        action: "LOGIN",
        entity: "User",
        entityId: user.id,
        userId: user.id,
        roleAtTime: user.role,
        meta: { performedBy: user.name, details: `User signed in with code ${user.loginCode || loginCode}.` },
      },
    });

    const redirectTo =
      user.role === "SUPER_ADMIN" ? "/admin/dashboard"
      : user.role === "MANAGER" ? "/warehouse/dashboard"
      : user.role === "SHOWROOM_STAFF" ? "/showroom-staff/dashboard"
      : user.role === "SHOWROOM_INCHARGE" ? "/showroom-incharge/dashboard"
      : "/dashboard";

    return { redirectTo };
  });
}

export async function signOutAction() {
  const session = await getSession();
  if (session) {
    await db.auditLog.create({
      data: {
        action: "LOGOUT",
        entity: "User",
        entityId: session.userId,
        userId: session.userId,
        roleAtTime: session.role,
        meta: { performedBy: session.name, details: "User logged out." },
      },
    });
  }

  await destroySession();
}

export async function setSimulatedSessionAction(
  role: any,
  dealerId?: string,
  warehouseId?: string,
  showroomId?: string
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      throw new AppError("Role switching is Super Admin only.", 403, "FORBIDDEN");
    }
    if (role !== "SUPER_ADMIN" && !isRole(role)) {
      throw new AppError("Unknown role.", 400, "VALIDATION");
    }

    await updateSessionPreview(role === "SUPER_ADMIN" ? undefined : role);

    const cookieStore = await cookies();
    for (const [name, value] of [
      ["prestige_dealer_id", dealerId],
      ["prestige_warehouse_id", warehouseId],
      ["prestige_showroom_id", showroomId],
    ] as const) {
      if (value) cookieStore.set(name, value, { path: "/", maxAge: SESSION_MAX_AGE });
      else cookieStore.delete(name);
    }

    revalidatePath("/", "layout");
    return undefined;
  });
}

// ————————————————————————————————————————————————
// User management (Super Admin only)
// ————————————————————————————————————————————————

async function requireSuperAdmin(what: string) {
  const user = await requireUser();
  if (user.actualRole !== "SUPER_ADMIN") {
    throw new AppError(`Unauthorized: ${what} is restricted to Super Admin.`, 403, "FORBIDDEN");
  }
  return user;
}

function validateRoleAssignment(role: string, warehouse_id?: string, showroom_id?: string) {
  if (!isRole(role)) {
    throw new AppError(`Invalid role "${role}". Allowed roles: ${ROLES.join(", ")}.`, 400, "VALIDATION");
  }
  if (role === "MANAGER" && !warehouse_id) {
    throw new AppError("A Manager must be assigned a warehouse.", 400, "VALIDATION");
  }
  if ((role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") && !showroom_id) {
    throw new AppError(
      "Showroom staff and in-charges must be assigned a showroom, or their blocks and approval queues will be empty.",
      400,
      "VALIDATION"
    );
  }
}

export async function createUserAction(payload: any): Promise<ActionResult<{ id: string; loginCode: string }>> {
  return runAction(async () => {
    const admin = await requireSuperAdmin("user management");
    const { name, email, password, role, warehouse_id, showroom_id, status, loginCode: customCode } = payload;

    if (!name || !role) {
      throw new AppError("Name and role are required.", 400, "VALIDATION");
    }
    validateRoleAssignment(role, warehouse_id, showroom_id);

    const userEmail = (email || `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}@prestigetiles.com`).toLowerCase().trim();
    if (await db.user.findUnique({ where: { email: userEmail } })) {
      throw new AppError("That email address is already registered.", 409, "DUPLICATE");
    }

    // Auto-generate or validate unique loginCode
    let finalCode = customCode?.trim().toUpperCase();
    if (!finalCode) {
      finalCode = await generateUniqueLoginCode(
        role,
        (role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") ? showroom_id : null
      );
    } else {
      if (await db.user.findFirst({ where: { loginCode: finalCode } })) {
        throw new AppError(`Login code "${finalCode}" is already assigned to another user.`, 409, "DUPLICATE");
      }
    }

    const defaultPassword = password && String(password).length >= 8 ? password : "prestige_default_pwd";

    const newUser = await db.user.create({
      data: {
        name,
        email: userEmail,
        loginCode: finalCode,
        password: await hashPassword(defaultPassword),
        role,
        dealer_id: null,
        warehouse_id: role === "MANAGER" ? warehouse_id : null,
        showroomId: role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE" ? showroom_id : null,
        status: status || "ACTIVE",
      },
    });

    await db.auditLog.create({
      data: {
        action: "USER_CREATE",
        entity: "User",
        entityId: newUser.id,
        userId: admin.userId,
        roleAtTime: admin.actualRole,
        meta: { performedBy: admin.name, details: `Created user ${newUser.name} [Code: ${finalCode}] with role ${newUser.role}.` },
      },
    });

    revalidatePath("/admin/users");
    return { id: newUser.id, loginCode: finalCode };
  });
}

export async function updateUserAction(userId: string, payload: any): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const admin = await requireSuperAdmin("user management");
    const { name, email, password, role, warehouse_id, showroom_id, status, loginCode: customCode } = payload;

    validateRoleAssignment(role, warehouse_id, showroom_id);

    const existing = await db.user.findUnique({ where: { id: userId } });
    if (!existing) throw new AppError("User not found.", 404, "NOT_FOUND");

    const updateData: any = {
      name,
      role,
      dealer_id: null,
      warehouse_id: role === "MANAGER" ? warehouse_id : null,
      showroomId: role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE" ? showroom_id : null,
      status,
    };

    if (email) updateData.email = email.toLowerCase().trim();
    if (password && String(password).length >= 8) updateData.password = await hashPassword(password);

    if (customCode && customCode.trim().toUpperCase() !== existing.loginCode) {
      const normalisedCode = customCode.trim().toUpperCase();
      if (await db.user.findFirst({ where: { loginCode: normalisedCode, NOT: { id: userId } } })) {
        throw new AppError(`Login code "${normalisedCode}" is already taken.`, 409, "DUPLICATE");
      }
      updateData.loginCode = normalisedCode;
    }

    const updatedUser = await db.user.update({ where: { id: userId }, data: updateData });

    await db.auditLog.create({
      data: {
        action: "USER_UPDATE",
        entity: "User",
        entityId: updatedUser.id,
        userId: admin.userId,
        roleAtTime: admin.actualRole,
        meta: { performedBy: admin.name, details: `Updated user ${updatedUser.name}.` },
      },
    });

    revalidatePath("/admin/users");
    return { id: updatedUser.id };
  });
}

export async function regenerateLoginCodeAction(userId: string): Promise<ActionResult<{ id: string; loginCode: string }>> {
  return runAction(async () => {
    const admin = await requireSuperAdmin("regenerate login code");
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw new AppError("User not found.", 404, "NOT_FOUND");

    const newCode = await generateUniqueLoginCode(targetUser.role, targetUser.showroomId);
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { loginCode: newCode },
    });

    await db.auditLog.create({
      data: {
        action: "USER_CODE_REGENERATE",
        entity: "User",
        entityId: updatedUser.id,
        userId: admin.userId,
        roleAtTime: admin.actualRole,
        meta: { performedBy: admin.name, details: `Regenerated login code for ${updatedUser.name} -> ${newCode}.` },
      },
    });

    revalidatePath("/admin/users");
    return { id: updatedUser.id, loginCode: newCode };
  });
}

export async function deactivateUserAction(
  userId: string,
  status: "DEACTIVATED" | "SUSPENDED" | "ACTIVE"
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const admin = await requireSuperAdmin("user management");
    if (userId === admin.userId && status !== "ACTIVE") {
      throw new AppError("You cannot deactivate your own account.", 400, "VALIDATION");
    }

    const updatedUser = await db.user.update({ where: { id: userId }, data: { status } });

    await db.auditLog.create({
      data: {
        action: `USER_STATUS_${status}`,
        entity: "User",
        entityId: updatedUser.id,
        userId: admin.userId,
        roleAtTime: admin.actualRole,
        meta: { performedBy: admin.name, details: `Set ${updatedUser.name} to ${status}.` },
      },
    });

    revalidatePath("/admin/users");
    return { id: updatedUser.id };
  });
}

// ————————————————————————————————————————————————
// Notifications
// ————————————————————————————————————————————————

export async function getNotificationsAction(limit = 20) {
  const { getNotifications } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session) return [];
  return getNotifications(session.userId, limit);
}

export async function getUnreadCountAction() {
  const { getUnreadCount } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session) return 0;
  return getUnreadCount(session.userId);
}

export async function markNotificationAsReadAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { markNotificationAsRead } = await import("@/services/NotificationService");
    const user = await requireUser();
    await markNotificationAsRead(user.userId, id);
    return undefined;
  });
}

export async function markAllNotificationsAsReadAction(): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { markAllNotificationsAsRead } = await import("@/services/NotificationService");
    const user = await requireUser();
    await markAllNotificationsAsRead(user.userId);
    return undefined;
  });
}

export async function deleteNotificationAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { deleteNotification } = await import("@/services/NotificationService");
    const user = await requireUser();
    await deleteNotification(user.userId, id);
    return undefined;
  });
}

export async function broadcastAnnouncementAction(payload: {
  title: string;
  message: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  audienceType: string;
  audienceFilter?: string | null;
  scheduledAt?: string | null;
  expiresAt?: string | null;
}): Promise<ActionResult<any>> {
  return runAction(async () => {
    const { createAnnouncement } = await import("@/services/NotificationService");
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
      throw new AppError("Only Super Admin and Managers can broadcast announcements.", 403, "FORBIDDEN");
    }

    if (!payload.title?.trim() || !payload.message?.trim()) {
      throw new AppError("A title and message are required.", 400, "VALIDATION");
    }

    const { scheduledAt, expiresAt, ...rest } = payload;
    const scheduled = scheduledAt ? new Date(scheduledAt) : null;
    const expires = expiresAt ? new Date(expiresAt) : null;

    if (scheduled && Number.isNaN(scheduled.getTime())) {
      throw new AppError("Invalid schedule date.", 400, "VALIDATION");
    }
    if (expires && Number.isNaN(expires.getTime())) {
      throw new AppError("Invalid expiry date.", 400, "VALIDATION");
    }
    if (scheduled && expires && expires <= scheduled) {
      throw new AppError("Expiry must be after the scheduled send time.", 400, "VALIDATION");
    }

    const result = await createAnnouncement({
      createdById: user.userId,
      ...rest,
      scheduledAt: scheduled,
      expiresAt: expires,
    });

    revalidatePath("/admin/announcements");
    revalidatePath("/warehouse/announcements");
    return result;
  });
}

export async function getAnnouncementsHistoryAction(limit = 20) {
  const { getAnnouncementsHistory } = await import("@/services/NotificationService");
  const session = await getEffectiveSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "MANAGER")) return [];
  return getAnnouncementsHistory(limit);
}

// ————————————————————————————————————————————————
// Dealer management — Super Admin only
// ————————————————————————————————————————————————

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
}): Promise<ActionResult<{ id: string; dealerId: string | null }>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageDealers(user.role), "Dealer management is restricted to Super Admin.");
    const { createDealer } = await import("@/services/DealerService");

    const dealer = await createDealer({
      ...payload,
      createdById: user.userId,
      createdByName: user.name,
    });

    revalidatePath("/admin/dealers");
    revalidatePath("/dealers");
    return { id: dealer.id, dealerId: dealer.dealerId };
  });
}

export async function updateDealerAction(
  id: string,
  payload: {
    name?: string;
    contact?: string;
    phone?: string;
    email?: string;
    address?: string;
    company?: string;
    showroomId?: string;
    status?: "ACTIVE" | "INACTIVE";
  }
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageDealers(user.role), "Dealer management is restricted to Super Admin.");
    const { updateDealer } = await import("@/services/DealerService");

    await updateDealer({ ...payload, id, updatedById: user.userId, updatedByName: user.name });

    revalidatePath("/admin/dealers");
    revalidatePath("/dealers");
    return undefined;
  });
}

export async function setDealerStatusAction(
  id: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageDealers(user.role), "Dealer management is restricted to Super Admin.");
    const { setDealerStatus } = await import("@/services/DealerService");

    await setDealerStatus({ id, status, performedById: user.userId, performedByName: user.name });

    revalidatePath("/admin/dealers");
    revalidatePath("/dealers");
    return undefined;
  });
}

export async function getDealerDetailAction(id: string) {
  const session = await getEffectiveSession();
  if (!session || session.role !== "SUPER_ADMIN") return null;
  const { getDealerDetail } = await import("@/services/DealerService");
  return getDealerDetail(id);
}

// ————————————————————————————————————————————————
// Warehouse management (Super Admin only)
// ————————————————————————————————————————————————

export async function createWarehouseAction(data: {
  name: string;
  code: string;
  location?: string | null;
  address?: string | null;
  status?: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageWarehouses(user.role), "Warehouse management is restricted to Super Admin.");
    const { createWarehouse } = await import("@/services/WarehouseService");

    const created = await createWarehouse({
      ...data,
      createdById: user.userId,
      createdByName: user.name,
    });

    revalidatePath("/admin/warehouses");
    revalidatePath("/warehouses");
    return { id: created.id };
  });
}

export async function updateWarehouseAction(
  id: string,
  data: {
    name?: string;
    location?: string | null;
    address?: string | null;
    status?: string;
  }
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageWarehouses(user.role), "Warehouse management is restricted to Super Admin.");
    const { updateWarehouse } = await import("@/services/WarehouseService");

    await updateWarehouse({
      id,
      ...data,
      updatedById: user.userId,
      updatedByName: user.name,
    });

    revalidatePath("/admin/warehouses");
    revalidatePath("/warehouses");
    return undefined;
  });
}

export async function deleteWarehouseAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageWarehouses(user.role), "Warehouse management is restricted to Super Admin.");
    const { deleteWarehouse } = await import("@/services/WarehouseService");

    await deleteWarehouse({
      id,
      performedById: user.userId,
      performedByName: user.name,
    });

    revalidatePath("/admin/warehouses");
    revalidatePath("/warehouses");
    return undefined;
  });
}

// ————————————————————————————————————————————————
// Showroom management (Super Admin only)
// ————————————————————————————————————————————————

export async function createShowroomAction(data: {
  name: string;
  subtitle?: string | null;
  addressLine: string;
  locality?: string | null;
  city: string;
  state?: string;
  postalCode?: string | null;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
  isFlagship?: boolean;
  published?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageShowrooms(user.role), "Showroom management is restricted to Super Admin.");
    const { createShowroom } = await import("@/services/ShowroomService");

    const created = await createShowroom({
      ...data,
      createdById: user.userId,
      createdByName: user.name,
    });

    revalidatePath("/admin/showrooms");
    return { id: created.id };
  });
}

export async function updateShowroomAction(
  id: string,
  data: {
    name?: string;
    subtitle?: string | null;
    addressLine?: string;
    locality?: string | null;
    city?: string;
    state?: string;
    postalCode?: string | null;
    phone?: string;
    whatsapp?: string | null;
    email?: string | null;
    managerName?: string | null;
    managerPhone?: string | null;
    isFlagship?: boolean;
    published?: boolean;
  }
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageShowrooms(user.role), "Showroom management is restricted to Super Admin.");
    const { updateShowroom } = await import("@/services/ShowroomService");

    await updateShowroom({
      id,
      ...data,
      updatedById: user.userId,
      updatedByName: user.name,
    });

    revalidatePath("/admin/showrooms");
    return undefined;
  });
}

export async function deleteShowroomAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    assertPermission(canManageShowrooms(user.role), "Showroom management is restricted to Super Admin.");
    const { deleteShowroom } = await import("@/services/ShowroomService");

    await deleteShowroom({
      id,
      deletedById: user.userId,
      deletedByName: user.name,
    });

    revalidatePath("/admin/showrooms");
    return undefined;
  });
}
