/**
 * Pure procurement-status derivation, shared by BlockQueryService (block
 * list/detail reads) and ProcurementService (Need-to-Order / purchase-order
 * reads and writes) without creating a circular import between the two.
 *
 * A block's procurement status is never stored — it is always derived from
 * `shortageQuantity` plus the linked ShipmentItem/Shipment status, so there
 * is exactly one place that can drift (the Shipment/ShipmentItem rows
 * already written by the receiving flow) rather than two (overstock spec
 * §12/§40 — reuse the existing Shipment state model rather than duplicating
 * it as a stored status column).
 */

export type ProcurementStatus =
  | "NOT_REQUIRED"
  | "NEED_TO_ORDER"
  | "ORDERED"
  | "IN_TRANSIT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export interface ProcurementBlockLike {
  shortageQuantity: number;
  procurementShipmentItem: { status: string; shipment: { status: string } } | null;
}

export function deriveProcurementStatus(block: ProcurementBlockLike): ProcurementStatus {
  if (block.shortageQuantity <= 0) return "NOT_REQUIRED";
  const item = block.procurementShipmentItem;
  if (!item) return "NEED_TO_ORDER";
  if (item.shipment.status === "CANCELLED") return "CANCELLED";
  if (item.status === "RECEIVED") return "RECEIVED";
  if (item.status === "PARTIALLY_RECEIVED") return "PARTIALLY_RECEIVED";
  if (["DISPATCHED", "IN_TRANSIT", "ARRIVED", "RECEIVING"].includes(item.shipment.status)) return "IN_TRANSIT";
  return "ORDERED"; // Shipment still EXPECTED — ordered but not yet dispatched by the supplier.
}

/**
 * Priority for the Need-to-Order queue (spec §34). Deliberately simple and
 * explainable rather than a scored model: a block that has already cleared
 * approval and is only waiting on stock is urgent by definition (everything
 * else about it is done), and anything sitting unresolved for several days
 * is worth surfacing even if it hasn't been approved yet.
 */
export function computeProcurementPriority(block: { status: string; createdAt: Date }): "URGENT" | "NORMAL" {
  if (block.status === "READY_TO_SHIP") return "URGENT";
  const ageHours = (Date.now() - block.createdAt.getTime()) / (60 * 60 * 1000);
  return ageHours > 72 ? "URGENT" : "NORMAL";
}
