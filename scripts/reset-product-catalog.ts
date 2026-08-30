/**
 * Product Catalog Data Reset Script
 *
 * Safely clears the current product catalog (1,125 products) so a new Excel catalog can be uploaded.
 *
 * Foreign-Key Safety:
 * - 1,116 unreferenced products -> Physically deleted (along with inventory & attribute rows).
 * - 9 historical products referenced by StockBlocks/Shipments -> Soft-deleted / Archived
 *   (status: "ARCHIVED", deletedAt: new Date()), maintaining 100% database integrity for history.
 *
 * Data Preservation:
 * - Preserves all 7 Users, 5 Showrooms, 2 Warehouses, 14 StockBlocks, 1 BlockOrder,
 *   1 Shipment, 22 Chat Messages, 1,282 Notifications, 282 Audit Logs.
 *
 * Usage: npx tsx scripts/reset-product-catalog.ts
 */
import { db } from "../src/lib/db";

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  PRODUCT CATALOG DATA RESET — EXECUTION & AUDIT");
  console.log("════════════════════════════════════════════════════════════\n");

  // 1. Initial State Recording
  const initialProductsCount = await db.product.count();
  const initialInventoriesCount = await db.inventory.count();
  const initialUsersCount = await db.user.count();
  const initialShowroomsCount = await db.showroom.count();
  const initialWarehousesCount = await db.warehouse.count();
  const initialStockBlocksCount = await db.stockBlock.count();
  const initialShipmentsCount = await db.shipment.count();

  console.log("Pre-Reset Snapshot:");
  console.log(`  - Total Products: ${initialProductsCount}`);
  console.log(`  - Total Inventories: ${initialInventoriesCount}`);
  console.log(`  - Users: ${initialUsersCount}`);
  console.log(`  - Showrooms: ${initialShowroomsCount}`);
  console.log(`  - Warehouses: ${initialWarehousesCount}`);
  console.log(`  - Stock Blocks: ${initialStockBlocksCount}`);
  console.log(`  - Shipments: ${initialShipmentsCount}\n`);

  // 2. Identify Referenced Product IDs in Business History
  const stockBlocks = await db.stockBlock.findMany({ select: { productId: true } });
  const shipmentItems = await db.shipmentItem.findMany({ select: { productId: true } });

  const referencedProductIds = new Set<string>();
  stockBlocks.forEach((b) => b.productId && referencedProductIds.add(b.productId));
  shipmentItems.forEach((s) => s.productId && referencedProductIds.add(s.productId));

  console.log(`Identified ${referencedProductIds.size} product(s) referenced by historical blocks/shipments.`);

  const allProducts = await db.product.findMany({ select: { id: true } });
  const unreferencedIds: string[] = [];
  const referencedIds: string[] = [];

  allProducts.forEach((p) => {
    if (referencedProductIds.has(p.id)) {
      referencedIds.push(p.id);
    } else {
      unreferencedIds.push(p.id);
    }
  });

  console.log(`  - Unreferenced Products to Delete: ${unreferencedIds.length}`);
  console.log(`  - Referenced Products to Archive: ${referencedIds.length}\n`);

  // 3. Delete Unreferenced Products & Related Records in Batches
  console.log("Clearing unreferenced product records...");

  const BATCH_SIZE = 250;
  for (let i = 0; i < unreferencedIds.length; i += BATCH_SIZE) {
    const batch = unreferencedIds.slice(i, i + BATCH_SIZE);

    // Delete attribute values
    await db.productAttributeValue.deleteMany({
      where: { productId: { in: batch } },
    });

    // Delete inventory records
    await db.inventory.deleteMany({
      where: { productId: { in: batch } },
    });

    // Delete products
    await db.product.deleteMany({
      where: { id: { in: batch } },
    });

    console.log(`  ✓ Cleared batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} products)`);
  }

  // 4. Archive Referenced Historical Products (Soft Delete)
  if (referencedIds.length > 0) {
    console.log(`\nArchiving ${referencedIds.length} referenced historical product(s)...`);
    await db.product.updateMany({
      where: { id: { in: referencedIds } },
      data: {
        status: "ARCHIVED",
        deletedAt: new Date(),
      },
    });

    await db.inventory.updateMany({
      where: { productId: { in: referencedIds } },
      data: {
        stockStatus: "ARCHIVED",
        totalStock: 0,
        availableStock: 0,
        blockedStock: 0,
      },
    });

    console.log(`  ✓ Archived ${referencedIds.length} historical product(s) safely.`);
  }

  // 5. Audit Final Database State
  const activeProductsCount = await db.product.count({
    where: { deletedAt: null, status: "ACTIVE" },
  });
  const finalTotalProducts = await db.product.count();
  const finalUsersCount = await db.user.count();
  const finalShowroomsCount = await db.showroom.count();
  const finalWarehousesCount = await db.warehouse.count();
  const finalStockBlocksCount = await db.stockBlock.count();
  const finalShipmentsCount = await db.shipment.count();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  POST-RESET VERIFICATION SUMMARY");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  - Active Catalog Product Count: ${activeProductsCount} (Target: 0)`);
  console.log(`  - Total Products Remaining in DB: ${finalTotalProducts} (${referencedIds.length} archived historical)`);
  console.log(`  - Users Intact: ${finalUsersCount} / ${initialUsersCount}`);
  console.log(`  - Showrooms Intact: ${finalShowroomsCount} / ${initialShowroomsCount}`);
  console.log(`  - Warehouses Intact: ${finalWarehousesCount} / ${initialWarehousesCount}`);
  console.log(`  - Stock Blocks Intact: ${finalStockBlocksCount} / ${initialStockBlocksCount}`);
  console.log(`  - Shipments Intact: ${finalShipmentsCount} / ${initialShipmentsCount}`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (activeProductsCount === 0 && finalUsersCount === initialUsersCount) {
    console.log("SUCCESS: Current product catalog cleared safely. System ready for Excel upload.");
  } else {
    console.error("WARNING: Verification check failed.");
  }
}

main()
  .catch((e) => {
    console.error("\n[RESET ERROR]", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
