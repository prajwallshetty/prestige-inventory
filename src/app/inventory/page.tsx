import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { getInventoryList } from "@/services/InventoryService";
import { getSessionContext } from "@/lib/session";
import { db } from "@/lib/db";
import { InventoryClientTable } from "@/components/inventory/InventoryClientTable";

export const revalidate = 0;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = (await searchParams) || {};
  const search = typeof params.search === "string" ? params.search : "";
  const brandId = typeof params.brandId === "string" ? params.brandId : "";
  const categoryId = typeof params.categoryId === "string" ? params.categoryId : "";
  const stockStatus = typeof params.status === "string" ? params.status : "";
  const page = parseInt(typeof params.page === "string" ? params.page : "1");

  const session = await getSessionContext();

  const [inventoryData, brands, categories] = await Promise.all([
    getInventoryList({
      search,
      brandId,
      categoryId,
      stockStatus,
      page,
      userRole: session.role,
      warehouseId: session.role === "MANAGER" ? session.warehouseId : undefined,
    }),
    db.brand.findMany({ select: { id: true, name: true } }),
    db.category.findMany({ select: { id: true, name: true } }),
  ]);

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">All Stock Inventory</h1>
            <p className="text-xs text-slate-400">
              Live stock levels, dealer allocations, in-transit units, and threshold statuses across catalog.
            </p>
          </div>
        </div>

        {/* INVENTORY TABLE COMPONENT */}
        <InventoryClientTable 
          initialData={inventoryData} 
          brands={brands} 
          categories={categories} 
          session={session} 
        />
      </div>
    </SidebarLayout>
  );
}
