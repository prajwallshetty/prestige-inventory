import { getBookingById } from "@/services/BookingService";
import { getSessionContext } from "@/lib/session";
import { notFound } from "next/navigation";
import { BookingDetailClient } from "@/app/bookings/[id]/BookingDetailClient";
import { db } from "@/lib/db";

export const revalidate = 0;

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = await getBookingById(id);
  const session = await getSessionContext();

  if (!booking) {
    notFound();
  }

  // Security Scopes Enforcement
  if (session.role === "DEALER" && booking.dealerId !== session.dealerId) {
    notFound();
  }

  if (session.role === "MANAGER" && booking.warehouseId !== session.warehouseId) {
    notFound();
  }

  if ((session.role === "SHOWROOM_STAFF" || session.role === "SHOWROOM_INCHARGE") && booking.requestedBy !== session.name) {
    notFound();
  }

  // Fetch recent audit logs for this booking
  const auditLogs = await db.auditLog.findMany({
    where: {
      entity: "StockBooking",
      entityId: id,
    },
    orderBy: { createdAt: "desc" },
  });

  // Map and serialize items for client safety
  const serializedBooking = {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    requestedBy: booking.requestedBy,
    requestedAt: booking.requestedAt.toISOString(),
    expiresAt: booking.expiresAt ? booking.expiresAt.toISOString() : null,
    approvedBy: booking.approvedBy,
    approvedAt: booking.approvedAt ? booking.approvedAt.toISOString() : null,
    confirmedAt: booking.confirmedAt ? booking.confirmedAt.toISOString() : null,
    cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
    releasedAt: booking.releasedAt ? booking.releasedAt.toISOString() : null,
    notes: booking.notes,
    priority: booking.priority,
    extensionRequested: booking.extensionRequested,
    extensionHours: booking.extensionHours,
    extensionReason: booking.extensionReason,
    dealer: {
      id: booking.dealer.id,
      name: booking.dealer.name,
      company: booking.dealer.company,
      email: booking.dealer.email,
      phone: booking.dealer.phone,
    },
    warehouse: {
      id: booking.warehouse.id,
      name: booking.warehouse.name,
      code: booking.warehouse.code,
    },
    items: booking.items.map((item) => {
      const inv = item.product.inventory || { availableStock: 0 };
      return {
        id: item.id,
        productId: item.productId,
        requestedQuantity: item.requestedQuantity,
        approvedQuantity: item.approvedQuantity,
        reservedQuantity: item.reservedQuantity,
        allocatedQuantity: item.allocatedQuantity,
        fulfilledQuantity: item.fulfilledQuantity,
        cancelledQuantity: item.cancelledQuantity,
        unit: item.unit,
        remarks: item.remarks,
        product: {
          id: item.product.id,
          name: item.product.name,
          sku: item.product.sku || item.product.productCode || item.product.id.slice(-6).toUpperCase(),
          size: item.product.size || "Standard",
          brandName: item.product.brandId || "Generic",
          availableStock: inv.availableStock,
          image_key: item.product.image_key,
          thumbnail_key: item.product.thumbnail_key,
          lifestyleImage: item.product.lifestyleImage,
          textureImage: item.product.textureImage,
        },
      };
    }),
  };

  const serializedAuditLogs = auditLogs.map((log) => {
    const meta = (log.meta as { performedBy?: string; details?: string }) || {};
    return {
      id: log.id,
      action: log.action,
      performedBy: meta.performedBy || "System",
      details: meta.details || log.action,
      createdAt: log.createdAt.toISOString(),
    };
  });

  return (
    <>
      <BookingDetailClient 
        booking={serializedBooking} 
        auditLogs={serializedAuditLogs}
        session={session} 
      />
    </>
  );
}
