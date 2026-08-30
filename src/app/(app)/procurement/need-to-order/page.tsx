import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { canManageProcurement } from "@/lib/permissions";
import { getNeedToOrderList } from "@/services/ProcurementService";
import { NeedToOrderClientList } from "@/components/procurement/NeedToOrderClientList";
import { db } from "@/lib/db";

export const revalidate = 0;

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function NeedToOrderPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");
  if (!canManageProcurement(session.role)) redirect("/dashboard");

  const params = (await searchParams) || {};
  const rawPriority = first(params.priority) || "";
  const priority = rawPriority === "URGENT" || rawPriority === "NORMAL" ? rawPriority : undefined;
  const filters = {
    search: first(params.search) || "",
    showroomId: first(params.showroomId) || "",
    priority: rawPriority,
    sort: first(params.sort) || "newest",
    page: Math.max(1, parseInt(first(params.page) || "1", 10) || 1),
    limit: 20,
  };

  const [result, showrooms] = await Promise.all([
    getNeedToOrderList({ ...filters, priority }, {
      role: session.role,
      userId: session.userId,
      showroomId: session.showroomId,
      warehouseId: session.warehouseId,
    }),
    db.showroom.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-[#111111]">Need to Order</h1>
        <p className="text-xs text-[#6B6B6B]">
          Blocks whose requested quantity exceeds physical stock. Select shortages for the same product and raise a
          purchase order.
        </p>
      </div>
      <NeedToOrderClientList result={result} filters={filters} showrooms={showrooms} />
    </div>
  );
}
