import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, ShoppingCart, Truck, PackageCheck } from "lucide-react";
import { getSessionContext } from "@/lib/session";
import { canManageProcurement } from "@/lib/permissions";
import { getProcurementDashboardSummary } from "@/services/ProcurementService";

export const revalidate = 0;

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="mt-3 text-2xl font-black text-[#111111]">{value.toLocaleString("en-IN")}</p>
      <p className="text-[10px] font-black uppercase tracking-wider text-[#6B6B6B]">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#9A9A9A]">{sub}</p>}
    </div>
  );
}

export default async function ProcurementDashboardPage() {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");
  if (!canManageProcurement(session.role)) redirect("/dashboard");

  const summary = await getProcurementDashboardSummary({
    role: session.role,
    userId: session.userId,
    showroomId: session.showroomId,
    warehouseId: session.warehouseId,
  });

  const prefix = session.role === "SUPER_ADMIN" ? "/admin" : "/warehouse";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-[#111111]">Procurement</h1>
        <p className="text-xs text-[#6B6B6B]">
          Overstock requests become a procurement requirement instead of a rejected block — track them here through to
          receiving.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Need to Order"
          value={summary.needToOrderProducts}
          sub={`${summary.needToOrderBoxes.toLocaleString("en-IN")} boxes · ${summary.needToOrderBlocks} blocks`}
          icon={ClipboardList}
          accent="bg-amber-100 text-amber-700"
        />
        <Tile
          label="Pending Purchase"
          value={summary.pendingPurchaseBoxes}
          sub="boxes ordered, not yet dispatched"
          icon={ShoppingCart}
          accent="bg-blue-100 text-blue-700"
        />
        <Tile
          label="In Transit"
          value={summary.inTransitBoxes}
          sub="boxes en route from supplier"
          icon={Truck}
          accent="bg-indigo-100 text-indigo-700"
        />
        <Tile
          label="Received"
          value={summary.receivedBoxes}
          sub="boxes received at the depot"
          icon={PackageCheck}
          accent="bg-emerald-100 text-emerald-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href={`${prefix}/procurement/need-to-order`}
          className="rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-xs transition-all hover:border-[#F2C202]"
        >
          <h2 className="text-sm font-black text-[#111111]">Need to Order</h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">Every open shortage, one row per block, ready to be ordered.</p>
        </Link>
        <Link
          href={`${prefix}/procurement/orders`}
          className="rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-xs transition-all hover:border-[#F2C202]"
        >
          <h2 className="text-sm font-black text-[#111111]">Purchase Orders</h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">Supplier orders raised from shortages — dispatch, transit, receiving.</p>
        </Link>
      </div>
    </div>
  );
}
