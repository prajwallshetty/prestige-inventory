import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { redirect } from "next/navigation";
import { NewBookingClient } from "@/app/(app)/bookings/new/NewBookingClient";

export const revalidate = 0;

export default async function NewBookingPage() {
  const session = await getSessionContext();

  // Route security: the read-only role can never reach the create form. The
  // action re-checks independently.
  if (!session.authenticated) redirect("/login");
  if (session.role === "WEAVER") {
    redirect("/viewer/dashboard");
  }

  // Fetch available products, brands, categories, warehouses and dealers
  const [products, warehouses, dealers] = await Promise.all([
    db.product.findMany({
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
    }),
    db.warehouse.findMany({ where: { status: "ACTIVE" } }),
    // A booking is always raised against a dealer/customer, unlike a Block.
    db.dealer.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, dealerId: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
      sku: p.sku || p.productCode || p.importKey || null,
      size: p.size || null,
      brandName: p.brand?.name || null,
      categoryName: p.category?.name || null,
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
          dealers={dealers}
          session={session}
        />
      </div>
    </>
  );
}
