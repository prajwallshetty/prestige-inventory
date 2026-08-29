import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { getBlockList } from "@/services/BlockQueryService";
import { SHIPMENT_BLOCK_STATUSES } from "@/lib/permissions";
import { ShipmentsClientList } from "@/components/blocks/ShipmentsClientList";
import { db } from "@/lib/db";

export const revalidate = 0;

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  const params = (await searchParams) || {};
  const filters = {
    status: first(params.status) || "",
    search: first(params.search) || "",
    sort: first(params.sort) || "newest",
    page: Math.max(1, parseInt(first(params.page) || "1", 10) || 1),
    limit: Math.min(100, Math.max(10, parseInt(first(params.limit) || "20", 10) || 20)),
  };

  const [result, products, dealers, warehouses] = await Promise.all([
    getBlockList(
      filters,
      {
        role: session.role,
        userId: session.userId,
        showroomId: session.showroomId,
        warehouseId: session.warehouseId,
      },
      { baseStatuses: SHIPMENT_BLOCK_STATUSES }
    ),
    db.product.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, sku: true, size: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    db.dealer.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, dealerId: true },
      orderBy: { name: "asc" },
    }),
    db.warehouse.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ShipmentsClientList
      mode="shipments"
      result={result}
      filters={filters}
      userRole={session.role}
      products={products}
      dealers={dealers}
      warehouses={warehouses}
    />
  );
}

