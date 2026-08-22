/**
 * Stock reconciliation CLI.
 *
 * Recomputes each product's `blockedStock` from the blocks that are genuinely
 * active, and `availableStock` from physical stock minus everything spoken for
 * (blocked, allocated, damaged, reserved). Any difference is drift — a row that
 * a pre-repair code path left inconsistent.
 *
 * Safe to run against production: the default is a dry run that only reports.
 *
 *   npm run db:reconcile            # report drift, change nothing
 *   npm run db:reconcile -- --apply # repair the rows it found
 */

import { reconcileInventory } from "../src/services/StockBlockService";
import { db } from "../src/lib/db";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\n════ STOCK RECONCILIATION ${apply ? "(APPLYING)" : "(dry run)"} ════\n`);

  const result = await reconcileInventory({ dryRun: !apply });

  if (result.details.length === 0) {
    console.log(`  No drift found across ${result.checked} inventory row(s).`);
  } else {
    console.log(`  ${result.details.length} of ${result.checked} row(s) drifted:\n`);
    for (const d of result.details) {
      console.log(`   • product ${d.productId}`);
      // Only print the figures that actually moved.
      if (d.was !== d.now) console.log(`       blocked   ${d.was} → ${d.now}`);
      if (d.wasAvailable !== d.nowAvailable) {
        console.log(`       available ${d.wasAvailable} → ${d.nowAvailable}`);
      }
      if (d.wasStatus !== d.nowStatus) {
        console.log(`       status    ${d.wasStatus} → ${d.nowStatus}`);
      }
    }
    console.log(
      apply
        ? `\n  Repaired ${result.repaired} row(s).`
        : `\n  Dry run — nothing written. Re-run with --apply to repair.`
    );
  }

  console.log("\n" + "═".repeat(40) + "\n");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Reconciliation failed:", err);
  await db.$disconnect();
  process.exit(1);
});
