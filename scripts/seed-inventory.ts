import { db } from "../src/lib/db";

async function main() {
  console.log("[SEED] Clearing existing data...");
  // Clear tables in reverse order of relationships
  await db.stockBookingItem.deleteMany({});
  await db.stockBooking.deleteMany({});
  await db.stockBlock.deleteMany({});
  await db.inventoryMovement.deleteMany({});
  await db.inventory.deleteMany({});
  await db.product.deleteMany({});
  await db.brand.deleteMany({});
  await db.category.deleteMany({});
  await db.dealer.deleteMany({});
  await db.warehouse.deleteMany({});

  console.log("[SEED] Creating Warehouses...");
  const mainDepot = await db.warehouse.create({
    data: {
      name: "Main Central Depot",
      code: "MAIN-DEPOT",
      location: "Mangalore Central",
      address: "Prestige Tiles Hub, Highway Road, Mangalore",
      status: "ACTIVE",
    },
  });

  const southWarehouse = await db.warehouse.create({
    data: {
      name: "South Warehouse",
      code: "SOUTH-WH",
      location: "Cochin Bypass",
      address: "South Logistics park, Ernakulam, Cochin",
      status: "ACTIVE",
    },
  });

  console.log("[SEED] Creating Dealers...");
  const abcTiles = await db.dealer.create({
    data: {
      name: "ABC Tiles Ltd",
      company: "ABC Tiles & Stone Corp",
      contact: "Ramesh Kumar",
      email: "dealer.abc@prestigetiles.com",
      phone: "+91 98765 43210",
      address: "M.G. Road, Bangalore, Karnataka",
      status: "ACTIVE",
    },
  });

  const apexCeramics = await db.dealer.create({
    data: {
      name: "Apex Ceramics",
      company: "Apex Home Solutions",
      contact: "Anita Rao",
      email: "dealer.apex@prestigetiles.com",
      phone: "+91 99887 76655",
      address: "Indiranagar, Bangalore, Karnataka",
      status: "ACTIVE",
    },
  });

  const southsideStones = await db.dealer.create({
    data: {
      name: "Southside Stones",
      company: "Southside Building Materials",
      contact: "Thomas Kurian",
      email: "dealer.southside@prestigetiles.com",
      phone: "+91 91234 56789",
      address: "Kadavanthra, Cochin, Kerala",
      status: "ACTIVE",
    },
  });

  console.log("[SEED] Creating Categories and Brands...");
  const catMarble = await db.category.create({
    data: {
      name: "Marble GVT Tiles",
      slug: "marble-gvt",
      description: "Premium Glazed Vitrified Tiles with marble finishes",
    },
  });

  const catCeramic = await db.category.create({
    data: {
      name: "Ceramic Wall Tiles",
      slug: "ceramic-wall",
      description: "High quality ceramic tiles for bathroom & kitchen walls",
    },
  });

  const brandKajaria = await db.brand.create({
    data: {
      name: "Kajaria",
      slug: "kajaria",
      description: "India's No. 1 Tile Manufacturer",
    },
  });

  const brandSomany = await db.brand.create({
    data: {
      name: "Somany",
      slug: "somany",
      description: "Premium ceramics and bathware solutions",
    },
  });

  console.log("[SEED] Creating Products...");
  const productsData = [
    {
      name: "Lumina Marble",
      slug: "lumina-marble",
      sku: "LUM-MAR-60x120",
      productCode: "GVT-8016",
      size: "600 x 1200 mm",
      finish: "Super Glossy",
      material: "Glazed Vitrified",
      categoryId: catMarble.id,
      brandId: brandKajaria.id,
      price: 1250.0,
      mrp: 1450.0,
      featured: true,
      lifestyleImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80",
    },
    {
      name: "Statuario Classic",
      slug: "statuario-classic",
      sku: "STAT-CLA-80x160",
      productCode: "GVT-9022",
      size: "800 x 1600 mm",
      finish: "Polished High Gloss",
      material: "Glazed Vitrified",
      categoryId: catMarble.id,
      brandId: brandKajaria.id,
      price: 1850.0,
      mrp: 2200.0,
      featured: true,
      lifestyleImage: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=600&q=80",
    },
    {
      name: "Royal Beige GVT",
      slug: "royal-beige-gvt",
      sku: "ROY-BEI-60x60",
      productCode: "GVT-6004",
      size: "600 x 600 mm",
      finish: "Satin Matt",
      material: "Glazed Vitrified",
      categoryId: catMarble.id,
      brandId: brandSomany.id,
      price: 750.0,
      mrp: 900.0,
      lifestyleImage: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80",
    },
    {
      name: "Urban Slate Charcoal",
      slug: "urban-slate-charcoal",
      sku: "URB-SLA-30x60",
      productCode: "CER-3011",
      size: "300 x 600 mm",
      finish: "Rustic Matt",
      material: "Ceramic",
      categoryId: catCeramic.id,
      brandId: brandSomany.id,
      price: 450.0,
      mrp: 550.0,
      lifestyleImage: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
    },
    {
      name: "Carrara White",
      slug: "carrara-white",
      sku: "CAR-WHI-60x120",
      productCode: "GVT-8025",
      size: "600 x 1200 mm",
      finish: "Glossy White",
      material: "Glazed Vitrified",
      categoryId: catMarble.id,
      brandId: brandKajaria.id,
      price: 1350.0,
      mrp: 1600.0,
      lifestyleImage: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80",
    },
  ];

  const products = [];
  for (const p of productsData) {
    const prod = await db.product.create({
      data: p,
    });
    products.push(prod);
    console.log(`[SEED] Created product: ${prod.name}`);
  }

  console.log("[SEED] Initializing Inventory Stock balances...");
  // Connect products to Main Depot inventory
  await db.inventory.create({
    data: {
      productId: products[0].id, // Lumina Marble
      warehouseId: mainDepot.id,
      totalStock: 570,
      availableStock: 450,
      blockedStock: 0,
      allocatedStock: 0,
      transitStock: 120,
      minimumStock: 50,
      reorderLevel: 100,
      stockStatus: "AVAILABLE",
    },
  });

  await db.inventory.create({
    data: {
      productId: products[1].id, // Statuario Classic
      warehouseId: mainDepot.id,
      totalStock: 150,
      availableStock: 150,
      blockedStock: 0,
      allocatedStock: 0,
      transitStock: 0,
      minimumStock: 30,
      reorderLevel: 50,
      stockStatus: "AVAILABLE",
    },
  });

  await db.inventory.create({
    data: {
      productId: products[2].id, // Royal Beige
      warehouseId: mainDepot.id,
      totalStock: 350,
      availableStock: 300,
      blockedStock: 0,
      allocatedStock: 0,
      transitStock: 50,
      minimumStock: 40,
      reorderLevel: 80,
      stockStatus: "AVAILABLE",
    },
  });

  await db.inventory.create({
    data: {
      productId: products[3].id, // Urban Slate
      warehouseId: mainDepot.id,
      totalStock: 150,
      availableStock: 50,
      blockedStock: 0,
      allocatedStock: 0,
      transitStock: 100,
      minimumStock: 50,
      reorderLevel: 100,
      stockStatus: "LOW_STOCK",
    },
  });

  await db.inventory.create({
    data: {
      productId: products[4].id, // Carrara White
      warehouseId: southWarehouse.id, // Put Carrara White in the South Warehouse
      totalStock: 200,
      availableStock: 200,
      blockedStock: 0,
      allocatedStock: 0,
      transitStock: 0,
      minimumStock: 30,
      reorderLevel: 60,
      stockStatus: "AVAILABLE",
    },
  });

  console.log("[SEED] Seeding database successfully completed!");
}

main()
  .catch((e) => {
    console.error("[SEED EXCEPTION]:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
