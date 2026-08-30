import { db } from "../src/lib/db";

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  DETAILED FOREIGN KEY & PRODUCT RELATIONSHIP INSPECTION");
  console.log("════════════════════════════════════════════════════════════\n");

  const products = await db.product.findMany({
    select: { id: true, name: true, sku: true, status: true, deletedAt: true },
  });

  const stockBlocks = await db.stockBlock.findMany({
    select: { id: true, productId: true, inventoryId: true },
  });

  const shipmentItems = await db.shipmentItem.findMany({
    select: { id: true, productId: true },
  });

  const blockProductIds = new Set(stockBlocks.map((b) => b.productId).filter(Boolean));
  const shipmentProductIds = new Set(shipmentItems.map((s) => s.productId).filter(Boolean));

  const referencedProductIds = new Set([...blockProductIds, ...shipmentProductIds]);

  console.log(`Total Products: ${products.length}`);
  console.log(`Referenced Product IDs in Blocks/Shipments: ${referencedProductIds.size}`);

  const referencedProducts = products.filter((p) => referencedProductIds.has(p.id));
  const unreferencedProducts = products.filter((p) => !referencedProductIds.has(p.id));

  console.log(`  - Products directly referenced by business history (blocks/shipments): ${referencedProducts.length}`);
  console.log(`  - Products unreferenced by any business history: ${unreferencedProducts.length}`);

  console.log("\n════════════════════════════════════════════════════════════");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
