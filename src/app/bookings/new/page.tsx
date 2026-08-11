import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { redirect } from "next/navigation";
import { NewBookingClient } from "./NewBookingClient";

export const revalidate = 0;

export default async function NewBookingPage() {
  const session = await getSessionContext();

  // Route security: Only Dealers, Super Admins, and Managers can create bookings.
  if (session.role === "VIEWER") {
    redirect("/dashboard");
  }

  // Fetch available products, brands, and categories
  const products = await db.product.findMany({
    where: { published: true, deletedAt: null },
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      inventory: {
        include: {
          warehouse: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const warehouses = await db.warehouse.findMany({
    where: { status: "ACTIVE" },
  });

  // Safe formatting for client
  const serializedProducts = products.map((p) => {
    const inv = p.inventory || {
      availableStock: 0,
      transitStock: 0,
      warehouseId: "",
      warehouse: { name: "N/A" },
    };
    return {
      id: p.id,
      name: p.name,
      sku: p.sku || p.productCode || p.id.slice(-6).toUpperCase(),
      size: p.size || "Std",
      brandName: p.brand?.name || "Unbranded",
      categoryName: p.category?.name || "General",
      image: p.lifestyleImage || p.textureImage || "",
      availableStock: inv.availableStock,
      transitStock: inv.transitStock,
      warehouseId: inv.warehouseId || "",
      warehouseName: inv.warehouse?.name || "Unassigned",
    };
  });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Create New Stock Reservation</h1>
          <p className="text-xs text-slate-400">
            Select products and quantities to request warehouse stock reservations. Multi-product requests are supported.
          </p>
        </div>

        <NewBookingClient 
          products={serializedProducts} 
          warehouses={warehouses} 
          session={session} 
        />
      </div>
    </SidebarLayout>
  );
}
