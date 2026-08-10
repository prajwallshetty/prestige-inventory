import { db } from "@/lib/db";

export async function createShipment({
  shipmentNumber,
  supplier,
  warehouseId,
  expectedDate,
  remarks,
  items,
}: {
  shipmentNumber: string;
  supplier?: string;
  warehouseId?: string;
  expectedDate?: Date;
  remarks?: string;
  items: Array<{ productId: string; expectedQuantity: number }>;
}) {
  return await db.$transaction(async (tx) => {
    // Determine default warehouse if unassigned
    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId) {
      const defaultWh = await tx.warehouse.findFirst();
      targetWarehouseId = defaultWh?.id;
    }

    const shipment = await tx.shipment.create({
      data: {
        shipmentNumber,
        supplier,
        warehouseId: targetWarehouseId,
        status: "EXPECTED",
        expectedDate,
        remarks,
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

    // Update inTransitStock on inventory records for each product
    for (const item of items) {
      const inv = await tx.inventory.findUnique({
        where: { productId: item.productId },
      });

      if (inv) {
        const prevTransit = inv.transitStock;
        const newTransit = prevTransit + item.expectedQuantity;

        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            transitStock: newTransit,
            stockStatus: inv.availableStock === 0 ? "INCOMING" : inv.stockStatus,
          },
        });

        // Record IN_TRANSIT Movement
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            productId: item.productId,
            warehouseId: inv.warehouseId,
            movementType: "IN_TRANSIT",
            quantity: item.expectedQuantity,
            previousQuantity: prevTransit,
            newQuantity: newTransit,
            referenceType: "SHIPMENT",
            referenceId: shipment.id,
            reason: `Shipment ${shipmentNumber} created`,
            performedBy: "Shipment Manager",
          },
        });
      }
    }

    return shipment;
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
  return await db.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      include: { items: true },
    });

    if (!shipment) throw new Error("Shipment record not found.");

    let allItemsFullyReceived = true;

    for (const rxItem of receivedItems) {
      const item = shipment.items.find((i) => i.id === rxItem.shipmentItemId);
      if (!item) continue;

      const receivedQty = rxItem.receivedQuantity;
      const damagedQty = rxItem.damagedQuantity;
      const shortQty = Math.max(0, item.expectedQuantity - receivedQty - damagedQty);

      // Update Shipment Item status
      await tx.shipmentItem.update({
        where: { id: item.id },
        data: {
          receivedQuantity: receivedQty,
          damagedQuantity: damagedQty,
          shortQuantity: shortQty,
          status: shortQty > 0 || damagedQty > 0 ? "PARTIALLY_RECEIVED" : "RECEIVED",
        },
      });

      if (shortQty > 0 || damagedQty > 0) {
        allItemsFullyReceived = false;
      }

      // Find inventory
      const inv = await tx.inventory.findUnique({
        where: { productId: item.productId },
      });

      if (inv) {
        const prevAvailable = inv.availableStock;
        const prevTransit = inv.transitStock;
        const prevDamaged = inv.damagedStock;

        const newAvailable = prevAvailable + receivedQty;
        const newTransit = Math.max(0, prevTransit - item.expectedQuantity);
        const newDamaged = prevDamaged + damagedQty;

        // Determine updated status
        let newStatus = "AVAILABLE";
        if (newAvailable <= 0) {
          newStatus = newTransit > 0 ? "INCOMING" : "OUT_OF_STOCK";
        } else if (inv.reorderLevel > 0 && newAvailable <= inv.reorderLevel) {
          newStatus = "LOW_STOCK";
        }

        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            availableStock: newAvailable,
            transitStock: newTransit,
            damagedStock: newDamaged,
            totalStock: newAvailable + inv.blockedStock + inv.allocatedStock + newDamaged,
            stockStatus: newStatus,
          },
        });

        // Record RECEIVED Stock Movement
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            productId: item.productId,
            warehouseId: inv.warehouseId,
            movementType: "RECEIVED",
            quantity: receivedQty,
            previousQuantity: prevAvailable,
            newQuantity: newAvailable,
            referenceType: "SHIPMENT",
            referenceId: shipment.id,
            reason: `Received from Shipment ${shipment.shipmentNumber}`,
            performedBy,
          },
        });

        // Record DAMAGED Stock Movement if damaged stock exists
        if (damagedQty > 0) {
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              productId: item.productId,
              warehouseId: inv.warehouseId,
              movementType: "DAMAGED",
              quantity: damagedQty,
              previousQuantity: prevDamaged,
              newQuantity: newDamaged,
              referenceType: "SHIPMENT",
              referenceId: shipment.id,
              reason: `Damaged tiles identified in Shipment ${shipment.shipmentNumber}`,
              performedBy,
            },
          });
        }
      }
    }

    // Update overall shipment status
    const updatedShipment = await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: allItemsFullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
        arrivalDate: new Date(),
      },
    });

    return updatedShipment;
  });
}
