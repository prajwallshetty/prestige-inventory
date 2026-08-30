import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/auth";
import { canCreateBlock, type Role } from "@/lib/permissions";
import { MultiProductBlockForm } from "@/components/blocks/MultiProductBlockForm";

export const revalidate = 0;

export default async function NewBlockPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/login");

  // Server-side gate. Weaver (and anything else without create rights) never
  // reaches the form; the action re-checks independently.
  if (!canCreateBlock(session.role as Role)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <h1 className="text-sm font-black uppercase text-rose-800">Not permitted</h1>
        <p className="mt-2 text-xs text-rose-700">
          Your role ({session.role.replace(/_/g, " ")}) has read-only access and cannot create stock blocks.
        </p>
      </div>
    );
  }

  const [dealers, showroom] = await Promise.all([
    db.dealer.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, dealerId: true, name: true },
      orderBy: { name: "asc" },
    }),
    session.showroomId
      ? db.showroom.findUnique({ where: { id: session.showroomId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">Create Stock Block</h1>
        <p className="text-xs text-[#6B6B6B]">
          Reserve stock for one or more products in a single submission. Physical stock is not reduced until shipment.
        </p>
      </div>

      <MultiProductBlockForm
        dealers={dealers}
        showroomName={showroom?.name ?? null}
        createdByName={session.name}
        createdByRole={session.role}
      />
    </div>
  );
}
