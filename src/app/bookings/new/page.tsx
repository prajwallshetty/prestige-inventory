import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { redirect } from "next/navigation";
import { NewBookingClient } from "@/app/bookings/new/NewBookingClient";

export const revalidate = 0;

export default async function NewBookingPage() {
  const session = await getSessionContext();

  // Route security: the read-only role can never reach the create form. The
  // action re-checks independently.
  if (!session.authenticated) redirect("/login");
  if (session.role === "WEAVER") {
    redirect("/viewer/dashboard");
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
      image_key: p.image_key,
      thumbnail_key: p.thumbnail_key,
      lifestyleImage: p.lifestyleImage,
      textureImage: p.textureImage,
      availableStock: inv.availableStock,
      transitStock: inv.transitStock,
      warehouseId: inv.warehouseId || "",
      warehouseName: inv.warehouse?.name || "Unassigned",
    };
  });

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Create New Stock Reservation</h1>
          <p className="text-xs text-[#6B6B6B]">
            Select products and quantities to request warehouse stock reservations. Multi-product requests are supported.
          </p>
        </div>

        <NewBookingClient 
          products={serializedProducts as any} 
          warehouses={warehouses} 
          session={session} 
        />
      </div>
    </>
  );
}
