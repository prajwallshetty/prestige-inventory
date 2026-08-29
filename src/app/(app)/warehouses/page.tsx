import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/auth";
import { canManageWarehouses, type Role } from "@/lib/permissions";
import { listWarehouses } from "@/services/WarehouseService";
import { WarehousesClient } from "@/components/admin/warehouses/WarehousesClient";

export const revalidate = 0;

export default async function WarehousesPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/login");

  const warehouses = await listWarehouses();
  const canManage = canManageWarehouses(session.role as Role);

  return (
    <WarehousesClient
      warehouses={warehouses.map((wh) => ({
        ...wh,
        createdAt: wh.createdAt.toISOString(),
      }))}
      canManage={canManage}
    />
  );
}
