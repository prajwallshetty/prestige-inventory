import { redirect } from "next/navigation";
import { getInventoryList, getInventoryFacets } from "@/services/InventoryService";
import { getSessionContext } from "@/lib/session";
import { InventoryClientTable } from "@/components/inventory/InventoryClientTable";

export const revalidate = 0;

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  const params = (await searchParams) || {};

  // Every filter lives in the URL, so a filtered view survives refresh, back,
  // forward and sharing (spec §22).
  const filters = {
    search: first(params.search),
    brandId: first(params.brandId),
    categoryId: first(params.categoryId),
    collection: first(params.collection),
    size: first(params.size),
    finish: first(params.finish),
    stockStatus: first(params.status),
    sort: first(params.sort) || "newest",
    page: Math.max(1, parseInt(first(params.page) || "1", 10) || 1),
    limit: Math.min(100, Math.max(10, parseInt(first(params.limit) || "20", 10) || 20)),
  };

  const [inventoryData, facets] = await Promise.all([
    getInventoryList({
      ...filters,
      userRole: session.role,
      // A Manager only sees their own warehouse's stock when one is assigned.
      warehouseId: session.role === "MANAGER" ? session.warehouseId : undefined,
    }),
    getInventoryFacets(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#111111] sm:text-2xl">All Stock Inventory</h1>
        <p className="text-xs text-[#6B6B6B]">
          Live stock levels, dealer allocations, in-transit units and threshold statuses across the catalogue.
        </p>
      </div>

      <InventoryClientTable
        initialData={inventoryData}
        brands={facets.brands}
        categories={facets.categories}
        sizes={facets.sizes}
        collections={facets.collections}
        session={session}
      />
    </div>
  );
}
