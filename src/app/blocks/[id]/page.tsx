import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/auth";
import { type Role } from "@/lib/permissions";
import { BlockDetailClient } from "@/components/blocks/BlockDetailClient";

export const revalidate = 0;

/**
 * Block detail — the destination for notification deep-links.
 *
 * Accepts either the database id or the human-readable block number, so
 * /blocks/BLK-2026-000123 works as well as /blocks/<cuid>.
 */
export default async function BlockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getEffectiveSession();
  if (!session) redirect("/login");

  const block = await db.stockBlock.findFirst({
    where: { OR: [{ id }, { block_number: id }] },
    include: {
      dealer: { select: { id: true, dealerId: true, name: true, company: true, phone: true } },
      showroom: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      inventory: {
        select: {
          totalStock: true,
          blockedStock: true,
          product: { select: { id: true, name: true, sku: true, productCode: true, importKey: true, size: true, brand: { select: { name: true } } } },
        },
      },
    },
  });

  if (!block) notFound();

  // Showroom users may only open blocks belonging to their own showroom.
  // Scope comes from the session, never from the URL (spec §36).
  const role = session.role as Role;
  const scoped = role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE";
  if (scoped && block.showroomId && block.showroomId !== session.showroomId) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <h1 className="text-sm font-black uppercase text-rose-800">Not permitted</h1>
        <p className="mt-2 text-xs text-rose-700">This block belongs to a different showroom.</p>
        <Link href="/blocks" className="mt-4 inline-block text-xs font-bold text-rose-900 underline">
          Back to blocks
        </Link>
      </div>
    );
  }

  // Audit trail powers the timeline — it is the actual recorded history rather
  // than steps inferred from the current status.
  const audit = await db.auditLog.findMany({
    where: { entity: "StockBlock", entityId: block.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, oldValue: true, newValue: true, meta: true, roleAtTime: true, createdAt: true },
  });

  const product = block.inventory?.product;

  return (
    <div className="space-y-5">
      <Link
        href="/blocks"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B6B6B] hover:text-[#111111]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All blocks
      </Link>

      <BlockDetailClient
        session={{ userId: session.userId, name: session.name, role: session.role }}
        block={{
          id: block.id,
          blockNumber: block.block_number,
          status: block.status,
          quantity: block.quantity,
          shippedQuantity: block.shippedQuantity,
          deliveredQuantity: block.deliveredQuantity,
          remarks: block.remarks,
          approvalRoute: block.approvalRoute,
          requestedBy: block.requestedBy,
          createdById: block.createdById,
          createdRole: block.createdRole,
          createdAt: block.createdAt.toISOString(),
          expiresAt: block.expiresAt?.toISOString() ?? null,
          inchargeApprovedBy: block.inchargeApprovedBy,
          inchargeApprovedAt: block.inchargeApprovedAt?.toISOString() ?? null,
          managerApprovedBy: block.managerApprovedBy,
          managerApprovedAt: block.managerApprovedAt?.toISOString() ?? null,
          readyToShipAt: block.readyToShipAt?.toISOString() ?? null,
          shippedAt: block.shippedAt?.toISOString() ?? null,
          deliveredAt: block.deliveredAt?.toISOString() ?? null,
          cancelledAt: block.cancelledAt?.toISOString() ?? null,
          releasedAt: block.releasedAt?.toISOString() ?? null,
          dealer: block.dealer,
          showroom: block.showroom,
          warehouse: block.warehouse,
          product: product
            ? {
                id: product.id,
                name: product.name,
                productNumber: product.sku || product.productCode || product.importKey || "—",
                size: product.size,
                brand: product.brand?.name ?? null,
              }
            : null,
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
