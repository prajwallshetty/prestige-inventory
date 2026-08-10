import { db } from "@/lib/db";

export async function seedInitialInventoryData() {
  console.log("[SEED] Initializing default Warehouse and synchronizing existing Products...");

  // 1. Ensure default Warehouse exists
  let mainDepot = await db.warehouse.findUnique({
    where: { code: "MAIN-DEPOT" },
  });

  if (!mainDepot) {
    mainDepot = await db.warehouse.create({
      data: {
        name: "Main Central Depot",
        code: "MAIN-DEPOT",
        location: "Mangalore Central",
        address: "Prestige Tiles Hub, Highway Road, Mangalore",
        status: "ACTIVE",
      },
    });
    console.log("[SEED] Created Main Central Depot:", mainDepot.id);
  }

  // 2. Fetch all existing products from PostgreSQL
  const products = await db.product.findMany({
    select: { id: true, name: true, sku: true, productCode: true },
  });

  console.log(`[SEED] Found ${products.length} existing products in database.`);

  let createdCount = 0;
  for (const product of products) {
    const existingInv = await db.inventory.findUnique({
      where: { productId: product.id },
    });

    if (!existingInv) {
      await db.inventory.create({
        data: {
          productId: product.id,
          warehouseId: mainDepot.id,
          totalStock: 350,
          availableStock: 250,
          blockedStock: 50,
          allocatedStock: 30,
          damagedStock: 0,
          transitStock: 20,
          minimumStock: 50,
          reorderLevel: 100,
          stockStatus: "AVAILABLE",
        },
      });
      createdCount++;
    }
  }

  console.log(`[SEED] Automatically linked ${createdCount} products to Inventory rows.`);
}

seedInitialInventoryData()
  .catch((e) => {
    console.error("[SEED] Error seeding data:", e);
  })
  .finally(async () => {
    await db.$disconnect();
  });
