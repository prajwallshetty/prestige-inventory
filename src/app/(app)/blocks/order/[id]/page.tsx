import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/auth";
import { type Role } from "@/lib/permissions";
import { deriveProcurementStatus } from "@/lib/procurementStatus";
import { getBlockOrderDetail } from "@/services/BlockOrderService";
import { BlockOrderDetailClient } from "@/components/blocks/BlockOrderDetailClient";

export const revalidate = 0;

/**
 * Multi-product order detail — every line item with its own stock,
 * shortage and procurement context, and one set of order-level actions
 * (spec §15/16). Accepts either the database id or the human-readable
 * order number, same convention as /blocks/[id].
 */
export default async function BlockOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getEffectiveSession();
  if (!session) redirect("/login");

  const order = await getBlockOrderDetail(id);
  if (!order) notFound();

  const role = session.role as Role;
  const scoped = role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE";
  if (scoped && order.showroomId !== (session.showroomId ?? null)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <h1 className="text-sm font-black uppercase text-rose-800">Not permitted</h1>
        <p className="mt-2 text-xs text-rose-700">This order belongs to a different showroom.</p>
        <Link href="/blocks" className="mt-4 inline-block text-xs font-bold text-rose-900 underline">
          Back to blocks
        </Link>
      </div>
    );
  }

  const audit = await db.auditLog.findMany({
    where: { entity: "StockBlock", entityId: { in: order.items.map((i) => i.id) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, oldValue: true, newValue: true, meta: true, roleAtTime: true, createdAt: true },
  });

  return (
    <div className="space-y-5">
      <Link
        href="/blocks"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B6B6B] hover:text-[#111111]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All blocks
      </Link>

      <BlockOrderDetailClient
        session={{
          userId: session.userId,
          name: session.name,
          role: session.role,
          showroomId: session.showroomId ?? null,
        }}
        order={{
          id: order.id,
          orderNumber: order.orderNumber,
          showroomId: order.showroomId,
          requestedBy: order.requestedBy,
          createdById: order.createdById,
          createdRole: order.createdRole,
          approvalRoute: order.approvalRoute,
          remarks: order.remarks,
          createdAt: order.createdAt.toISOString(),
          expiresAt: order.expiresAt?.toISOString() ?? null,
          dealer: order.dealer,
          showroom: order.showroom,
          warehouse: order.warehouse,
          items: order.items.map((item) => {
            const product = item.inventory?.product;
            return {
              id: item.id,
              blockNumber: item.block_number,
              status: item.status,
              quantity: item.quantity,
              shippedQuantity: item.shippedQuantity,
              deliveredQuantity: item.deliveredQuantity,
              shortageQuantity: item.shortageQuantity,
              availableQuantity: Math.max(0, item.quantity - item.shortageQuantity),
              procurementStatus: deriveProcurementStatus({
                shortageQuantity: item.shortageQuantity,
                procurementShipmentItem: item.procurementShipmentItem
                  ? { status: item.procurementShipmentItem.status, shipment: { status: item.procurementShipmentItem.shipment.status } }
                  : null,
              }),
              procurementShipment: item.procurementShipmentItem?.shipment ?? null,
              createdById: item.createdById,
              product: product
                ? {
                    id: product.id,
                    name: product.name,
                    productNumber: product.sku || product.productCode || "—",
                    size: product.size,
                    brand: product.brand?.name ?? null,
                    thumbnailKey: product.thumbnail_key || product.image_key || null,
                  }
                : null,
            };
          }),
        }}
        audit={audit.map((a) => ({
          id: a.id,
          action: a.action,
          from: (a.oldValue as any)?.status ?? null,
          to: (a.newValue as any)?.status ?? null,
          performedBy: (a.meta as any)?.performedBy ?? null,
          reason: (a.meta as any)?.reason ?? null,
          role: a.roleAtTime,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
