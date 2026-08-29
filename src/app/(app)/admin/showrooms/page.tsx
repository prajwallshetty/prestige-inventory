import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/auth";
import { canManageShowrooms, type Role } from "@/lib/permissions";
import { listShowrooms } from "@/services/ShowroomService";
import { ShowroomsClient } from "@/components/admin/showrooms/ShowroomsClient";

export const revalidate = 0;

export default async function ShowroomsPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/login");

  const showrooms = await listShowrooms();
  const canManage = canManageShowrooms(session.role as Role);

  return (
    <ShowroomsClient
      showrooms={showrooms.map((sh) => ({
        ...sh,
        createdAt: sh.createdAt.toISOString(),
      }))}
      canManage={canManage}
    />
  );
}
