import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { canManageProcurement } from "@/lib/permissions";
import { getProcurementOrdersList } from "@/services/ProcurementService";
import { ProcurementOrdersClientList } from "@/components/procurement/ProcurementOrdersClientList";

export const revalidate = 0;

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ProcurementOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");
  if (!canManageProcurement(session.role)) redirect("/dashboard");

  const params = (await searchParams) || {};
  const filters = {
    search: first(params.search) || "",
    status: first(params.status) || "",
  };

  const raw = await getProcurementOrdersList(filters);
  const result = {
    ...raw,
    items: raw.items.map((order) => ({
      id: order.id,
      shipmentNumber: order.shipmentNumber,
      supplier: order.supplier,
      purchaseReference: order.purchaseReference,
      status: order.status,
      expectedDate: order.expectedDate?.toISOString() ?? null,
      dispatchDate: order.dispatchDate?.toISOString() ?? null,
      arrivalDate: order.arrivalDate?.toISOString() ?? null,
      remarks: order.remarks,
      createdAt: order.createdAt.toISOString(),
      warehouse: order.warehouse,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        expectedQuantity: item.expectedQuantity,
        receivedQuantity: item.receivedQuantity,
        damagedQuantity: item.damagedQuantity,
        shortQuantity: item.shortQuantity,
        status: item.status,
        product: item.product,
        blocks: item.blocks,
      })),
    })),
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-[#111111]">Purchase Orders</h1>
        <p className="text-xs text-[#6B6B6B]">
          Supplier procurement raised from the Need to Order queue — distinct from customer/showroom shipments.
        </p>
      </div>
      <ProcurementOrdersClientList result={result} filters={filters} />
    </div>
  );
}
