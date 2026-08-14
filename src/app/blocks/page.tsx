import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { db } from "@/lib/db";
import { BlocksClientList } from "@/components/blocks/BlocksClientList";
import { getSessionContext } from "@/lib/session";
import Link from "next/link";

export const revalidate = 0;

export default async function BlocksPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  const params = (await searchParams) || {};
  const statusFilter = typeof params.status === "string" ? params.status : "";

  const whereCondition: any = {};
  if (statusFilter === "EXPIRING") {
    const next24h = new Date();
    next24h.setHours(next24h.getHours() + 24);
    whereCondition.status = "APPROVED";
    whereCondition.expiresAt = { lte: next24h };
  } else if (statusFilter) {
    whereCondition.status = statusFilter;
  }

  // Enforce server-side security scoping based on Role
  if (session.role === "DEALER") {
    whereCondition.dealerId = session.dealerId || "non-existent-id";
  } else if (session.role === "SHOWROOM_STAFF" || session.role === "SHOWROOM_INCHARGE") {
    whereCondition.showroomId = session.showroomId || "non-existent-id";
  } else if (session.role === "MANAGER") {
    if (session.warehouseId) {
      whereCondition.warehouseId = session.warehouseId;
    }
  }

  const blocks = await db.stockBlock.findMany({
    where: whereCondition,
    include: {
      dealer: { select: { id: true, name: true, company: true } },
      showroom: { select: { id: true, name: true } },
      inventory: {
        include: {
          product: { select: { id: true, name: true, sku: true, productCode: true, brand: { select: { name: true } }, size: true, lifestyleImage: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Dealer Stock Reservations & Blocks</h1>
            <p className="text-xs text-slate-400">
              Manage stock hold requests, approve dealer reservations, and monitor automated expiration timers.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-slate-900 p-1 border border-slate-800 text-xs">
            <Link
              href="/blocks"
              className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                !statusFilter ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All Blocks
            </Link>
            <Link
              href="/blocks?status=PENDING"
              className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                statusFilter === "PENDING" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Pending
            </Link>
            <Link
              href="/blocks?status=APPROVED"
              className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                statusFilter === "APPROVED" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Active
            </Link>
            <Link
              href="/blocks?status=EXPIRING"
              className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                statusFilter === "EXPIRING" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Expiring Soon
            </Link>
          </div>
        </div>

        <BlocksClientList blocks={blocks} session={session} />
      </div>
    </SidebarLayout>
  );
}
