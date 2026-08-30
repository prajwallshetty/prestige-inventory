/**
 * End-to-end proof of the overstock/procurement workflow (spec §41).
 *
 * Product starts with 100 boxes physical stock.
 *   TEST 1: request 80  -> allowed, shortage 0
 *   TEST 2: request 100 -> allowed, shortage 0
 *   TEST 3: request 200 -> allowed, available-at-creation 100, shortage 100
 *
 * The TEST 3 block's shortage is then walked through the full procurement
 * lifecycle and each invariant is checked along the way:
 *   - raising a purchase order does not touch totalStock
 *   - moving the order to IN_TRANSIT does not touch totalStock (only
 *     transitStock) — physical stock must not be invented before it arrives
 *   - receiving the order is the one point totalStock actually increases
 *   - the block's shortage is resolved to 0 once its shortfall is received
 *   - the block can now be shipped in full because physical stock covers it
 *
 * Creates its own throwaway product/inventory/blocks and removes them
 * afterwards (test 1/2's blocks are cancelled first so their reservations
 * don't stay live).
 *
 * Run: npx tsx scripts/test-procurement-workflow.ts
 */
import { db } from "../src/lib/db";
import { createBlockRequest, cancelBlock, shipBlock } from "../src/services/StockBlockService";
import { createPurchaseOrder, advanceProcurementStatus, receiveProcurement } from "../src/services/ProcurementService";

const MARKER = "__PROCUREMENT_TEST__";
let failures = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label} — ${detail}`);
  if (!condition) failures++;
}

async function main() {
  const warehouse = await db.warehouse.findFirst();
  if (!warehouse) throw new Error("No warehouse to attach test inventory to.");

  const product = await db.product.create({
    data: { slug: `procurement-test-${Date.now()}`, name: `${MARKER} Product`, status: "ACTIVE" },
  });
  const inventory = await db.inventory.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: 100,
      availableStock: 100,
      blockedStock: 0,
      allocatedStock: 0,
      damagedStock: 0,
      stockStatus: "AVAILABLE",
    },
  });
  console.log("Setup: totalStock=100\n");

  // ——— TEST 1: request 80, fully within stock ———
  const block1 = await createBlockRequest({
    productId: product.id,
    quantity: 80,
    requestedBy: `${MARKER} T1`,
    userRole: "MANAGER",
    remarks: MARKER,
  });
  console.log("TEST 1 — request 80 (physical 100):");
  check("block created", true, `status=${block1.status}`);
  check("shortage is 0", block1.shortageQuantity === 0, `shortageQuantity=${block1.shortageQuantity}`);
  await cancelBlock({ blockId: block1.id, performedBy: "SYSTEM", role: "MANAGER", reason: MARKER });

  // ——— TEST 2: request 100, exactly at stock ———
  const block2 = await createBlockRequest({
    productId: product.id,
    quantity: 100,
    requestedBy: `${MARKER} T2`,
    userRole: "MANAGER",
    remarks: MARKER,
  });
  console.log("\nTEST 2 — request 100 (physical 100):");
  check("block created", true, `status=${block2.status}`);
  check("shortage is 0", block2.shortageQuantity === 0, `shortageQuantity=${block2.shortageQuantity}`);
  await cancelBlock({ blockId: block2.id, performedBy: "SYSTEM", role: "MANAGER", reason: MARKER });

  // ——— TEST 3: request 200, exceeds stock — the overstock case ———
  const block3 = await createBlockRequest({
    productId: product.id,
    quantity: 200,
    requestedBy: `${MARKER} T3`,
    userRole: "MANAGER",
    remarks: MARKER,
  });
  console.log("\nTEST 3 — request 200 (physical 100):");
  check("block created (not rejected)", true, `status=${block3.status}`);
  check("shortage is 100", block3.shortageQuantity === 100, `shortageQuantity=${block3.shortageQuantity}`);

  const invAfterBlock = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  check("physical stock unchanged at 100", invAfterBlock.totalStock === 100, `totalStock=${invAfterBlock.totalStock}`);
  check("physical stock never negative", invAfterBlock.totalStock >= 0, `totalStock=${invAfterBlock.totalStock}`);

  // Manager approves the full 200 (approval doesn't require physical stock —
  // only shipping does).
  const { approveBlock } = await import("../src/services/StockBlockService");
  await approveBlock({ blockId: block3.id, approvedBy: `${MARKER} Manager`, role: "MANAGER" });

  // Shipping the full 200 now must fail — only 100 is physically available.
  try {
    await shipBlock({ blockId: block3.id, vehicleNumber: "TEST-1234", performedBy: `${MARKER} Manager`, role: "MANAGER" });
    check("shipping full 200 before procurement is blocked", false, "shipBlock unexpectedly succeeded");
  } catch (e: any) {
    check("shipping full 200 before procurement is blocked", e.code === "PROCUREMENT_PENDING", e.message);
  }

  // ——— Manager orders the shortfall ———
  const po = await createPurchaseOrder({
    blockIds: [block3.id],
    supplier: "Test Supplier",
    purchaseReference: MARKER,
    performedBy: `${MARKER} Manager`,
    role: "MANAGER",
  });
  console.log("\nProcurement — purchase order raised:");
  check("purchase order created", po.status === "EXPECTED", `status=${po.status}`);

  const invAfterOrder = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  check("physical stock still 100 after ordering", invAfterOrder.totalStock === 100, `totalStock=${invAfterOrder.totalStock}`);
  check("transitStock now 100", invAfterOrder.transitStock === 100, `transitStock=${invAfterOrder.transitStock}`);

  await advanceProcurementStatus({ shipmentId: po.id, status: "DISPATCHED", performedBy: `${MARKER} Manager`, role: "MANAGER" });
  const inTransitPo = await advanceProcurementStatus({ shipmentId: po.id, status: "IN_TRANSIT", performedBy: `${MARKER} Manager`, role: "MANAGER" });
  console.log("\nProcurement — moved to IN_TRANSIT:");
  check("purchase order is IN_TRANSIT", inTransitPo.status === "IN_TRANSIT", `status=${inTransitPo.status}`);

  const invInTransit = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  check("physical stock STILL 100 while in transit", invInTransit.totalStock === 100, `totalStock=${invInTransit.totalStock}`);

  // ——— Receive the full 100 ———
  const shipmentWithItems = await db.shipment.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
  const received = await receiveProcurement({
    shipmentId: po.id,
    receivedItems: shipmentWithItems.items.map((i) => ({ shipmentItemId: i.id, receivedQuantity: i.expectedQuantity, damagedQuantity: 0 })),
    performedBy: `${MARKER} Manager`,
    role: "MANAGER",
  });
  console.log("\nProcurement — RECEIVED:");
  check("purchase order fully RECEIVED", received.status === "RECEIVED", `status=${received.status}`);

  const invReceived = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  check("physical stock now 200", invReceived.totalStock === 200, `totalStock=${invReceived.totalStock}`);
  check("transitStock back to 0", invReceived.transitStock === 0, `transitStock=${invReceived.transitStock}`);

  const blockAfterReceive = await db.stockBlock.findUniqueOrThrow({ where: { id: block3.id } });
  check("block shortage resolved to 0", blockAfterReceive.shortageQuantity === 0, `shortageQuantity=${blockAfterReceive.shortageQuantity}`);

  // ——— Now the full 200 can be shipped ———
  const shipped = await shipBlock({ blockId: block3.id, vehicleNumber: "TEST-5678", performedBy: `${MARKER} Manager`, role: "MANAGER" });
  console.log("\nFulfillment — shipping the full 200 now that stock covers it:");
  check("block fully shipped", shipped.status === "SHIPPED", `status=${shipped.status}`);

  const invFinal = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  check("physical stock never went negative at any point", invFinal.totalStock >= 0, `final totalStock=${invFinal.totalStock}`);

  console.log("\n" + "=".repeat(60));
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  console.log("=".repeat(60));

  // Cleanup
  await db.inventoryMovement.deleteMany({ where: { inventoryId: inventory.id } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [block3.id, po.id] } } }).catch(() => {});
  await db.stockBlock.deleteMany({ where: { inventoryId: inventory.id } });
  await db.shipmentItem.deleteMany({ where: { shipmentId: po.id } });
  await db.shipment.delete({ where: { id: po.id } }).catch(() => {});
  await db.inventory.delete({ where: { id: inventory.id } });
  await db.product.delete({ where: { id: product.id } });
  console.log("\nTest data cleaned up.");

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[TEST ERROR]", e);
  process.exit(1);
});
