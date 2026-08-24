import { db } from "../src/lib/db";

const TARGET_SKUS = [
  "CAR-WHI-60x120",
  "ROY-BEI-60x60",
  "STAT-CLA-80x160",
  "LUM-MAR-60x120"
];

async function main() {
  console.log("Searching for target products to delete...", TARGET_SKUS);

  const products = await db.product.findMany({
    where: {
      OR: [
        { sku: { in: TARGET_SKUS } },
        { name: { in: ["Carrara White", "Royal Beige GVT", "Statuario Classic", "Lumina Marble"] } }
      ]
    }
  });

  console.log(`Found ${products.length} product(s) in DB matching criteria:`);
  for (const p of products) {
    console.log(` - ${p.name} (${p.sku}) [ID: ${p.id}]`);
  }

  for (const prod of products) {
    console.log(`Deleting dependencies and product: ${prod.name} (SKU: ${prod.sku})...`);

    const productWhere = { productId: prod.id };

    await db.stockBookingItem.deleteMany({ where: productWhere });
    await db.stockBlock.deleteMany({ where: productWhere });
    await db.inventoryMovement.deleteMany({ where: productWhere });
    await db.inventory.deleteMany({ where: productWhere });

    await db.product.delete({ where: { id: prod.id } });
    console.log(`? Deleted product ${prod.name} (${prod.sku})`);
  }

  console.log("Deletion complete!");
}

main()
  .catch((err) => {
    console.error("Error deleting products:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
