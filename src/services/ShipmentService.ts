import { db, STOCK_TX_OPTIONS } from "@/lib/db";
import {
  lockInventoryByProduct,
  writeInventory,
  recordMovement,
  invalidateStockCaches,
} from "@/services/StockBlockService";
import { AppError } from "@/lib/permissions";

/**
 * SUPPLIER → DEPOT procurement shipments (purchase orders), modelled by the
 * existing Shipment/ShipmentItem tables. Kept deliberately distinct from the
 * DEPOT → showroom/customer shipment tracked on StockBlock — the two "in
 * transit" concepts must never be mixed (overstock/procurement spec §31).
 *
 * Row-locks the inventory it touches with the same `SELECT … FOR UPDATE`
 * discipline as StockBlockService, so two purchase orders (or a purchase
 * order and a block) landing on the same product's inventory row at the same
 * moment can never race each other into a lost update.
 */

export async function createShipment({
  shipmentNumber,
  supplier,
  purchaseReference,
  warehouseId,
  expectedDate,
  remarks,
  createdById,
  items,
}: {
  shipmentNumber: string;
  supplier?: string;
  purchaseReference?: string;
  warehouseId?: string;
  expectedDate?: Date;
  remarks?: string;
  createdById?: string | null;
  items: Array<{ productId: string; expectedQuantity: number }>;
}) {
  if (!items || items.length === 0) {
    throw new AppError("A purchase order needs at least one item.", 400, "VALIDATION");
  }

  const result = await db.$transaction(async (tx) => {
    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId) {
      const defaultWh = await tx.warehouse.findFirst();
      targetWarehouseId = defaultWh?.id;
    }

    const shipment = await tx.shipment.create({
      data: {
        shipmentNumber,
        supplier,
        purchaseReference,
        warehouseId: targetWarehouseId,
        status: "EXPECTED",
        expectedDate,
        remarks,
        createdById: createdById || null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            expectedQuantity: item.expectedQuantity,
            status: "PENDING",
          })),
        },
      },
      include: { items: true },
    });

    // Lock and update each product's inventory row in a stable order
    // (ascending productId) so two purchase orders touching an overlapping
    // set of products can never deadlock against each other.
    for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const inv = await lockInventoryByProduct(tx, item.productId);
      if (!inv) continue; // product has no inventory row yet — nothing to reserve against

      const after = await writeInventory(tx, inv, {
        transitStock: inv.transitStock + item.expectedQuantity,
      });

      await recordMovement(tx, {
        inv,
        productId: item.productId,
        movementType: "IN_TRANSIT",
        quantity: item.expectedQuantity,
        previousQuantity: inv.transitStock,
        newQuantity: after.transitStock,
        referenceId: shipment.id,
        referenceType: "SHIPMENT",
        reason: `Purchase order ${shipmentNumber} raised`,
        performedBy: "Procurement",
      });
    }

    return shipment;
  }, STOCK_TX_OPTIONS);

  await invalidateStockCaches();
  return result;
}

/**
 * Advances a purchase order's own lifecycle (raised → dispatched from
 * supplier → in transit → arrived), distinct from the receiving step below.
 * Only forward moves within the declared order are allowed; skipping ahead
 * (e.g. EXPECTED straight to ARRIVED) is fine — the operator may only learn
 * about a shipment once it's already on a truck.
 */
const SHIPMENT_FORWARD_ORDER = ["EXPECTED", "DISPATCHED", "IN_TRANSIT", "ARRIVED"] as const;

export async function advanceShipmentStatus({
  shipmentId,
  status,
  dispatchDate,
}: {
  shipmentId: string;
  status: "DISPATCHED" | "IN_TRANSIT" | "ARRIVED" | "CANCELLED";
  dispatchDate?: Date;
}) {
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new AppError("Purchase order not found.", 404, "NOT_FOUND");

  if (status === "CANCELLED") {
    if (shipment.status === "RECEIVED" || shipment.status === "PARTIALLY_RECEIVED") {
      throw new AppError("A purchase order that has already been received cannot be cancelled.", 409, "CONFLICT");
    }
  } else {
    const fromIdx = SHIPMENT_FORWARD_ORDER.indexOf(shipment.status as any);
    const toIdx = SHIPMENT_FORWARD_ORDER.indexOf(status);
    if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
      throw new AppError(
        `Cannot move a purchase order from ${shipment.status} to ${status}.`,
        409,
        "CONFLICT"
      );
    }
  }

  return db.shipment.update({
    where: { id: shipmentId },
    data: {
      status,
      dispatchDate: status === "DISPATCHED" ? dispatchDate || new Date() : shipment.dispatchDate,
    },
  });
}

export async function receiveShipmentStock({
  shipmentId,
  receivedItems,
  performedBy,
}: {
  shipmentId: string;
  receivedItems: Array<{
    shipmentItemId: string;
    receivedQuantity: number;
    damagedQuantity: number;
  }>;
  performedBy: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      include: { items: true },
    });
    if (!shipment) throw new AppError("Purchase order not found.", 404, "NOT_FOUND");
    if (shipment.status === "RECEIVED" || shipment.status === "CANCELLED") {
      throw new AppError(`This purchase order is already ${shipment.status.toLowerCase()}.`, 409, "CONFLICT");
    }

    let allItemsFullyReceived = true;
    const receivedByProduct = new Map<string, { item: (typeof shipment.items)[number]; receivedQty: number; damagedQty: number }>();

    for (const rxItem of receivedItems) {
      const item = shipment.items.find((i) => i.id === rxItem.shipmentItemId);
      if (!item) continue;

      const receivedQty = Math.max(0, rxItem.receivedQuantity);
      const damagedQty = Math.max(0, rxItem.damagedQuantity);
      if (receivedQty + damagedQty > item.expectedQuantity) {
        throw new AppError(
          `Received + damaged (${receivedQty + damagedQty}) cannot exceed the expected ${item.expectedQuantity} for this line.`,
          400,
          "VALIDATION"
        );
      }
      const shortQty = Math.max(0, item.expectedQuantity - receivedQty - damagedQty);

      await tx.shipmentItem.update({
        where: { id: item.id },
        data: {
          receivedQuantity: receivedQty,
          damagedQuantity: damagedQty,
          shortQuantity: shortQty,
          status: shortQty > 0 || damagedQty > 0 ? "PARTIALLY_RECEIVED" : "RECEIVED",
        },
      });

      if (shortQty > 0 || damagedQty > 0) allItemsFullyReceived = false;
      receivedByProduct.set(item.productId, { item, receivedQty, damagedQty });
    }

    // Lock each affected product's inventory row in a stable order, same
    // deadlock-avoidance discipline as createShipment.
    for (const productId of [...receivedByProduct.keys()].sort()) {
      const { item, receivedQty, damagedQty } = receivedByProduct.get(productId)!;
      const inv = await lockInventoryByProduct(tx, productId);
      if (!inv) continue;

      // The physical goods arrive now — this is the one point in the whole
      // procurement chain where totalStock actually increases (spec §21/§22).
      const after = await writeInventory(tx, inv, {
        totalStock: inv.totalStock + receivedQty,
        transitStock: Math.max(0, inv.transitStock - item.expectedQuantity),
        damagedStock: inv.damagedStock + damagedQty,
      });

      await recordMovement(tx, {
        inv,
        productId,
        movementType: "RECEIVED",
        quantity: receivedQty,
        previousQuantity: inv.totalStock,
        newQuantity: after.totalStock,
        referenceId: shipment.id,
        referenceType: "SHIPMENT",
        reason: `Received from purchase order ${shipment.shipmentNumber}`,
        performedBy,
      });

      if (damagedQty > 0) {
        await recordMovement(tx, {
          inv,
          productId,
          movementType: "DAMAGED",
          quantity: damagedQty,
          previousQuantity: inv.damagedStock,
          newQuantity: after.damagedStock,
          referenceId: shipment.id,
          referenceType: "SHIPMENT",
          reason: `Damaged stock identified in purchase order ${shipment.shipmentNumber}`,
          performedBy,
        });
      }

      // Resolve the shortage on whichever blocks this line was covering,
      // oldest first — the same FIFO discipline as any other stock draw-down.
      // A block's shortage only shrinks by stock that has actually arrived;
      // partial/damaged receipt leaves the remainder outstanding.
      let remaining = receivedQty;
      if (remaining > 0) {
        const linkedBlocks = await tx.stockBlock.findMany({
          where: { procurementShipmentItemId: item.id, shortageQuantity: { gt: 0 } },
          orderBy: { createdAt: "asc" },
          select: { id: true, shortageQuantity: true },
        });
        for (const b of linkedBlocks) {
          if (remaining <= 0) break;
          const reduce = Math.min(b.shortageQuantity, remaining);
          if (reduce <= 0) continue;
          await tx.stockBlock.update({
            where: { id: b.id },
            data: { shortageQuantity: b.shortageQuantity - reduce },
          });
          remaining -= reduce;
        }
      }
    }

    const updatedShipment = await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: allItemsFullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
        arrivalDate: shipment.arrivalDate || new Date(),
      },
    });

    return updatedShipment;
  }, STOCK_TX_OPTIONS);

  await invalidateStockCaches();
  return result;
}
