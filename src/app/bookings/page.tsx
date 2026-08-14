import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { getBookingList, getBookingSummary } from "@/services/BookingService";
import { getSessionContext } from "@/lib/session";
import { db } from "@/lib/db";
import { BookingsDashboardClient } from "./BookingsDashboardClient";

export const revalidate = 0;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  const params = (await searchParams) || {};

  // Build filters based on URL parameters and user role security scopes
  const filters: any = {
    status: typeof params.status === "string" ? params.status : undefined,
    priority: typeof params.priority === "string" ? params.priority : undefined,
    search: typeof params.search === "string" ? params.search : undefined,
  };

  // Enforce security scopes
  if (session.role === "DEALER") {
    filters.dealerId = session.dealerId || "abc-dealer-id-placeholder";
  } else if (session.role === "MANAGER") {
    filters.warehouseId = session.warehouseId || undefined;
  } else if (session.role === "SHOWROOM_STAFF" || session.role === "SHOWROOM_INCHARGE") {
    filters.requestedBy = session.name;
  } else {
    // SUPER_ADMIN / AUDITOR
    filters.warehouseId = typeof params.warehouseId === "string" ? params.warehouseId : undefined;
    filters.dealerId = typeof params.dealerId === "string" ? params.dealerId : undefined;
  }

  const [bookings, summary, allDealers, allWarehouses] = await Promise.all([
    getBookingList(filters),
    getBookingSummary({ dealerId: filters.dealerId, warehouseId: filters.warehouseId }),
    db.dealer.findMany({ select: { id: true, name: true } }),
    db.warehouse.findMany({ select: { id: true, name: true, code: true } }),
  ]);

  const serializedBookings = bookings.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    status: b.status,
    requestedBy: b.requestedBy,
    requestedAt: b.requestedAt.toISOString(),
    expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
    priority: b.priority,
    notes: b.notes,
    dealer: {
      name: b.dealer.name,
      company: b.dealer.company,
    },
    warehouse: {
      name: b.warehouse.name,
      code: b.warehouse.code,
    },
    items: b.items.map((i) => ({
      id: i.id,
      requestedQuantity: i.requestedQuantity,
      approvedQuantity: i.approvedQuantity,
      product: {
        name: i.product.name,
        sku: i.product.sku,
      },
    })),
  }));

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {session.role === "DEALER" ? "My Stock Reservations" : "Stock Reservation Management Queue"}
            </h1>
            <p className="text-xs text-slate-400">
              {session.role === "DEALER" 
                ? "Track your submitted hold requests, confirm approved allocations, and monitor timers."
                : "Review, approve, hold, or dispatch dealer stock holdings, and view queue metrics."}
            </p>
          </div>
        </div>

        <BookingsDashboardClient
          bookings={serializedBookings}
          summary={summary}
          dealers={allDealers}
          warehouses={allWarehouses}
          session={session}
        />
      </div>
    </SidebarLayout>
  );
}
