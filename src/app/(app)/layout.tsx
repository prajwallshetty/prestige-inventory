import { AppShell } from "@/components/layout/AppShell";

/**
 * Shared chrome for every authenticated section (dashboard, inventory, chat,
 * blocks, shipments, transit, bookings, reports, dealers, warehouses,
 * in-transit, and every role-prefixed area under admin/, warehouse/,
 * showroom-incharge/, showroom-staff/, viewer/, dealer/, system/).
 *
 * This used to be duplicated as an identical layout.tsx inside each of those
 * 16 top-level route segments. Next only keeps a layout mounted across a
 * navigation when the destination route shares the *same* layout instance in
 * the tree — 16 separate files meant 16 separate instances, so AppShell (and
 * its session + dealer/warehouse/showroom + pending-approval queries, and the
 * sidebar's chat/notification SSE connections) fully unmounted and remounted
 * on every navigation between sections. One layout here, wrapping the route
 * group, is what actually makes it persist.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
