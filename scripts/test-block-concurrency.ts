/**
 * Proves (or disproves) that concurrent overstock block creation still
 * computes shortage correctly and never over-reserves or negatives physical
 * stock (overstock/procurement spec §26/§42).
 *
 * With available = 10, two SIMULTANEOUS requests for 7 boxes each must BOTH
 * succeed (a block may exceed available stock — that's the whole point of
 * the overstock workflow) with:
 *   - totalStock unchanged at 10 (never negative, never invented)
 *   - blockedStock = 14 (both full requests reserved)
 *   - availableStock = 0 (floored, not negative)
 *   - combined shortageQuantity across both blocks = 4 (14 requested - 10 physical)
 *   - no block's own shortage double-counts the other's reservation — the row
 *     lock on Inventory serialises the two transactions, so whichever commits
 *     second computes its shortage against what the first already reserved.
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
  console.log("Firing two SIMULTANEOUS requests for 7 boxes each (demand=14 > physical=10)...\n");

  const attempt = (label: string) =>
    createBlockRequest({
      productId: product.id,
      quantity: 7,
      requestedBy: `${MARKER} ${label}`,
      userRole: "MANAGER",
      remarks: MARKER,
    })
      .then((block) => ({ label, ok: true, error: null as string | null, shortage: block.shortageQuantity }))
      .catch((e: any) => ({ label, ok: false, error: e.message, shortage: null as number | null }));

  const results = await Promise.all([attempt("User A"), attempt("User B")]);
  results.forEach((r) =>
    console.log(
      `  ${r.label}: ${r.ok ? `SUCCEEDED — shortage=${r.shortage}` : "rejected — " + r.error}`
    )
  );

  const after = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  const successes = results.filter((r) => r.ok).length;
  const totalShortage = results.reduce((sum, r) => sum + (r.shortage ?? 0), 0);

  console.log("\nResulting inventory:");
  console.log(`  totalStock     = ${after.totalStock}`);
  console.log(`  blockedStock   = ${after.blockedStock}`);
  console.log(`  availableStock = ${after.availableStock}`);
  console.log(`  combined shortage across both blocks = ${totalShortage}`);

  const physicalStockCorrupted = after.totalStock !== 10;
  const availableNegative = after.availableStock < 0;
  const blockedAsExpected = after.blockedStock === 14;
  const shortageAsExpected = totalShortage === 4;

  console.log("\n" + "=".repeat(60));
  const pass = successes === 2 && !physicalStockCorrupted && !availableNegative && blockedAsExpected && shortageAsExpected;
  if (pass) {
    console.log("PASS — both overstock requests succeeded; physical stock untouched;");
    console.log("       shortage correctly split across the two blocks; nothing went negative.");
  } else {
    console.log("FAIL:");
    if (successes !== 2) console.log(`  expected both requests to succeed, got ${successes}`);
    if (physicalStockCorrupted) console.log(`  totalStock changed from 10 to ${after.totalStock} — should never move here`);
    if (availableNegative) console.log(`  availableStock is negative: ${after.availableStock}`);
    if (!blockedAsExpected) console.log(`  blockedStock = ${after.blockedStock}, expected 14`);
    if (!shortageAsExpected) console.log(`  combined shortage = ${totalShortage}, expected 4`);
  }
  console.log("=".repeat(60));

  // Cleanup
  await db.inventoryMovement.deleteMany({ where: { inventoryId: inventory.id } });
  await db.stockBlock.deleteMany({ where: { inventoryId: inventory.id } });
  await db.auditLog.deleteMany({ where: { entity: "StockBlock", meta: { path: ["performedBy"], string_contains: MARKER } } }).catch(() => {});
  await db.inventory.delete({ where: { id: inventory.id } });
  await db.product.delete({ where: { id: product.id } });
  console.log("\nTest data cleaned up.");

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("[TEST ERROR]", e);
  process.exit(1);
});
