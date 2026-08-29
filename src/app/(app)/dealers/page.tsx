import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/auth";
import { canManageDealers, type Role } from "@/lib/permissions";
import { listDealers } from "@/services/DealerService";
import { DealersClient } from "@/components/dealers/DealersClient";

export const revalidate = 0;

export default async function DealersPage() {
  const [session, dealers, showrooms] = await Promise.all([
    getEffectiveSession(),
    listDealers(),
    db.showroom.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Everyone may view the register; only Super Admin sees mutating controls.
  // The server actions enforce this independently — hiding buttons is not
  // the security boundary.
  const canManage = canManageDealers((session?.role as Role) ?? "WEAVER");

  return (
    <DealersClient
      dealers={dealers.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
      showrooms={showrooms}
      canManage={canManage}
    />
  );
}
