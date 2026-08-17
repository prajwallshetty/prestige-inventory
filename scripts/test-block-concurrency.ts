/**
 * Proves (or disproves) that concurrent block creation can over-reserve stock.
 *
 * Spec requirement: with available = 10, two simultaneous requests for 7 must
 * result in exactly one success and one "insufficient stock" failure. If both
 * succeed, the system has double-reserved the same physical stock.
 *
 * Creates its own throwaway product/inventory and removes it afterwards.
 * Run: npx tsx scripts/test-block-concurrency.ts
 */
import { db } from "../src/lib/db";
import { createBlockRequest } from "../src/services/StockBlockService";

const MARKER = "__CONCURRENCY_TEST__";

async function main() {
  const warehouse = await db.warehouse.findFirst();
  if (!warehouse) throw new Error("No warehouse to attach test inventory to.");

  // Fresh product with exactly 10 available boxes.
  const product = await db.product.create({
    data: {
      slug: `concurrency-test-${Date.now()}`,
      name: `${MARKER} Product`,
      status: "ACTIVE",
    },
  });
  const inventory = await db.inventory.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: 10,
      availableStock: 10,
      blockedStock: 0,
      allocatedStock: 0,
      damagedStock: 0,
      stockStatus: "AVAILABLE",
    },
  });

  console.log("Setup: totalStock=10, availableStock=10, blockedStock=0");
  console.log("Firing two SIMULTANEOUS requests for 7 boxes each...\n");

  const attempt = (label: string) =>
    createBlockRequest({
      productId: product.id,
      quantity: 7,
      requestedBy: `${MARKER} ${label}`,
      userRole: "MANAGER",
      remarks: MARKER,
    })
      .then(() => ({ label, ok: true, error: null as string | null }))
      .catch((e: any) => ({ label, ok: false, error: e.message }));

  const results = await Promise.all([attempt("User A"), attempt("User B")]);
  results.forEach((r) =>
    console.log(`  ${r.label}: ${r.ok ? "SUCCEEDED" : "rejected — " + r.error}`)
  );

  const after = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  const successes = results.filter((r) => r.ok).length;

  console.log("\nResulting inventory:");
  console.log(`  totalStock     = ${after.totalStock}`);
  console.log(`  blockedStock   = ${after.blockedStock}`);
  console.log(`  availableStock = ${after.availableStock}`);

  const overReserved = after.blockedStock > after.totalStock || after.availableStock < 0;
  console.log("\n" + "=".repeat(52));
  if (successes === 1 && !overReserved) {
    console.log("PASS — exactly one reservation succeeded. Stock is safe.");
  } else {
    console.log(`FAIL — ${successes} reservations succeeded (expected 1).`);
    console.log(`       blocked=${after.blockedStock} of total=${after.totalStock}` +
      (overReserved ? "  ** STOCK OVER-RESERVED **" : ""));
  }
  console.log("=".repeat(52));

  // Cleanup
  await db.inventoryMovement.deleteMany({ where: { inventoryId: inventory.id } });
  await db.stockBlock.deleteMany({ where: { inventoryId: inventory.id } });
  await db.auditLog.deleteMany({ where: { entity: "StockBlock", meta: { path: ["performedBy"], string_contains: MARKER } } }).catch(() => {});
  await db.inventory.delete({ where: { id: inventory.id } });
  await db.product.delete({ where: { id: product.id } });
  console.log("\nTest data cleaned up.");

  process.exit(successes === 1 && !overReserved ? 0 : 1);
}

main().catch((e) => {
  console.error("[TEST ERROR]", e);
  process.exit(1);
});
