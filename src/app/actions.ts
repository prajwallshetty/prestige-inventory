"use server";

import { db } from "@/lib/db";
import { adjustStock } from "@/services/StockAdjustmentService";
import { createBlockRequest, approveBlock, releaseBlock } from "@/services/StockBlockService";
import { createShipment, receiveShipmentStock } from "@/services/ShipmentService";
import { revalidatePath } from "next/cache";
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
import { setSessionContext } from "@/lib/session";

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
  const productId = formData.get("productId") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const remarks = formData.get("remarks") as string;
  const durationHours = parseInt((formData.get("durationHours") as string) || "48");

  await createBlockRequest({
    productId,
    quantity,
    remarks,
    durationHours,
    requestedBy: "Dealer Sales Rep",
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function approveBlockAction(blockId: string) {
  await approveBlock({
    blockId,
    approvedBy: "Inventory Manager",
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function releaseBlockAction(blockId: string, reason?: string) {
  await releaseBlock({
    blockId,
    releasedBy: "Inventory Manager",
    reason: reason || "Manual reservation release",
  });

  revalidatePath("/blocks");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function setSimulatedSessionAction(role: any, dealerId?: string, warehouseId?: string) {
  await setSessionContext({ role, dealerId, warehouseId });
  revalidatePath("/", "layout");
}

export async function createBookingAction(input: any) {
  const result = await createBooking(input);
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
  const [dealers, warehouses] = await Promise.all([
    db.dealer.findMany({ select: { id: true, name: true } }),
    db.warehouse.findMany({ select: { id: true, name: true, code: true } }),
  ]);
  return { dealers, warehouses };
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
