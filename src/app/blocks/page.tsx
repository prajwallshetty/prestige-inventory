import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { getBlockList } from "@/services/BlockQueryService";
import { BlocksClientList } from "@/components/blocks/BlocksClientList";
import { db } from "@/lib/db";

export const revalidate = 0;

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function BlocksPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  const params = (await searchParams) || {};

  const filters = {
    status: first(params.status) || "",
    search: first(params.search) || "",
    dealerId: first(params.dealerId) || "",
    showroomId: first(params.showroomId) || "",
    from: first(params.from) || "",
    to: first(params.to) || "",
    sort: first(params.sort) || "newest",
    page: Math.max(1, parseInt(first(params.page) || "1", 10) || 1),
    limit: Math.min(100, Math.max(10, parseInt(first(params.limit) || "20", 10) || 20)),
  };

  // Everything — filtering, searching, sorting, paging and scoping — is done
  // in the database. The page previously fetched every block in the system.
  const [result, dealers, showrooms] = await Promise.all([
    getBlockList(filters, {
      role: session.role,
      userId: session.userId,
      showroomId: session.showroomId,
      warehouseId: session.warehouseId,
    }),
    db.dealer.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, dealerId: true },
      orderBy: { name: "asc" },
    }),
    session.role === "SUPER_ADMIN" || session.role === "MANAGER"
      ? db.showroom.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <BlocksClientList
      result={result}
      filters={filters}
      dealers={dealers}
      showrooms={showrooms}
      session={{
        role: session.role,
        userId: session.userId ?? null,
        showroomId: session.showroomId ?? null,
        name: session.name ?? "",
      }}
    />
  );
}
