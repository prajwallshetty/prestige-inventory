/**
 * Prestige Tiles — Multi-Category Product Types Migration
 *
 * 1. Upserts default ProductTypes (Tiles, Sanitary, Paints, Gums & Adhesives, etc.)
 * 2. Upserts default Units (Box, Piece, Bag, Litre, Kg, etc.)
 * 3. Seeds dynamic ProductAttributeDefinition records for Paints & Sanitary
 * 4. Maps all existing Products in PostgreSQL to ProductType = "Tiles" and links Unit relation
 */

import { db } from "../src/lib/db";

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

const DEFAULT_PRODUCT_TYPES = [
  { name: "Tiles", description: "Vitrified, Ceramic, Marble & Porcelain Floor and Wall Tiles", icon: "Boxes", sortOrder: 1 },
  { name: "Sanitary", description: "Water closets, EWCs, Commodes, Wash Basins & Sanitaryware", icon: "Bath", sortOrder: 2 },
  { name: "Paints", description: "Interior & Exterior Emulsions, Primers, Enamels & Wall Finishes", icon: "Paintbrush", sortOrder: 3 },
  { name: "Gums & Adhesives", description: "Tile Adhesives, Epoxy Grout, Bonding Agents & Mortars", icon: "Package", sortOrder: 4 },
  { name: "Bath Fittings", description: "Faucets, Showers, Valves, Drains & Bathroom Accessories", icon: "ShowerHead", sortOrder: 5 },
  { name: "Construction Chemicals", description: "Waterproofing Compounds, Sealants, Additives & Repair Mortars", icon: "FlaskConical", sortOrder: 6 },
  { name: "CP Fittings", description: "Chrome Plated Brass Fittings, Taps, Mixers & Diverters", icon: "Wrench", sortOrder: 7 },
  { name: "Faucets", description: "Pillar Taps, Basin Mixers, Wall Mixers & Spouts", icon: "Droplets", sortOrder: 8 },
  { name: "Sinks", description: "Kitchen Sinks, Quartz Sinks, Stainless Steel Sinks", icon: "Utensils", sortOrder: 9 },
  { name: "Shower Systems", description: "Overhead Showers, Hand Showers, Thermostatic Panels & Jets", icon: "ShowerHead", sortOrder: 10 },
  { name: "Toilet / WC", description: "Wall Hung WCs, One Piece Commodes, Coupled Closets & Urinals", icon: "Store", sortOrder: 11 },
  { name: "Wash Basins", description: "Table Top, Wall Hung, Pedestal & Integrated Wash Basins", icon: "Maximize", sortOrder: 12 },
  { name: "Other", description: "Tools, Spacers, Levellers & Accessories", icon: "Grid", sortOrder: 99 },
];

const DEFAULT_UNITS = [
  { name: "Box", symbol: "Box", sortOrder: 1 },
  { name: "Piece", symbol: "Pc", sortOrder: 2 },
  { name: "Bag", symbol: "Bag", sortOrder: 3 },
  { name: "Litre", symbol: "L", sortOrder: 4 },
  { name: "Kilogram", symbol: "Kg", sortOrder: 5 },
  { name: "Tin", symbol: "Tin", sortOrder: 6 },
  { name: "Bucket", symbol: "Bucket", sortOrder: 7 },
  { name: "Square Feet", symbol: "Sq.ft", sortOrder: 8 },
];

async function main() {
  console.log("==========================================================================");
  console.log(" PRESTIGE TILES — MULTI-CATEGORY PRODUCT TYPES MIGRATION");
  console.log("==========================================================================");

  // 1. Seed ProductTypes
  console.log("[1/4] Upserting default ProductTypes...");
  const typeMap = new Map<string, string>();

  for (const pt of DEFAULT_PRODUCT_TYPES) {
    const slug = slugify(pt.name);
    let record = await db.productType.findUnique({ where: { slug } });
    if (!record) {
      record = await db.productType.create({
        data: {
          name: pt.name,
          slug,
          description: pt.description,
          icon: pt.icon,
          sortOrder: pt.sortOrder,
          isActive: true,
        },
      });
      console.log(`  + Created ProductType: ${pt.name} (ID: ${record.id})`);
    } else {
      console.log(`  = Found ProductType: ${pt.name} (ID: ${record.id})`);
    }
    typeMap.set(pt.name.toLowerCase(), record.id);
  }

  // 2. Seed Units
  console.log("\n[2/4] Upserting default Units...");
  const unitMap = new Map<string, string>();

  for (const u of DEFAULT_UNITS) {
    let unitObj = await db.unit.findFirst({
      where: { OR: [{ name: u.name }, { symbol: u.symbol }] },
    });
    if (!unitObj) {
      unitObj = await db.unit.create({
        data: {
          name: u.name,
          symbol: u.symbol,
          sortOrder: u.sortOrder,
          isActive: true,
        },
      });
      console.log(`  + Created Unit: ${u.name} [${u.symbol}]`);
    } else {
      console.log(`  = Found Unit: ${u.name} [${u.symbol}]`);
    }
    unitMap.set(u.symbol.toLowerCase(), unitObj.id);
    unitMap.set(u.name.toLowerCase(), unitObj.id);
  }

  // 3. Seed Attribute Definitions
  console.log("\n[3/4] Seeding ProductAttributeDefinitions for Paints & Sanitary...");
  const paintsTypeId = typeMap.get("paints");
  if (paintsTypeId) {
    const paintAttrs = [
      { name: "Colour", key: "colour", dataType: "text", sortOrder: 1 },
      { name: "Finish", key: "finish", dataType: "select", options: ["Matt", "Glossy", "Silk", "Satin", "Eggshell"], sortOrder: 2 },
      { name: "Volume", key: "volume", dataType: "text", unit: "L", sortOrder: 3 },
      { name: "Coverage", key: "coverage", dataType: "text", unit: "sq.ft/L", sortOrder: 4 },
    ];
    for (const attr of paintAttrs) {
      await db.productAttributeDefinition.upsert({
        where: { productTypeId_key: { productTypeId: paintsTypeId, key: attr.key } },
        create: {
          productTypeId: paintsTypeId,
          name: attr.name,
          key: attr.key,
          dataType: attr.dataType,
          unit: attr.unit,
          options: attr.options ? JSON.stringify(attr.options) : null,
          sortOrder: attr.sortOrder,
        },
        update: {},
      });
    }
  }

  const sanitaryTypeId = typeMap.get("sanitary");
  if (sanitaryTypeId) {
    const sanitaryAttrs = [
      { name: "Material", key: "material", dataType: "select", options: ["Vitreous China", "Ceramic", "Granite", "Stainless Steel"], sortOrder: 1 },
      { name: "Mounting Type", key: "mounting_type", dataType: "select", options: ["Wall Hung", "Table Top", "Floor Mounted", "Integrated"], sortOrder: 2 },
      { name: "Colour", key: "colour", dataType: "text", sortOrder: 3 },
    ];
    for (const attr of sanitaryAttrs) {
      await db.productAttributeDefinition.upsert({
        where: { productTypeId_key: { productTypeId: sanitaryTypeId, key: attr.key } },
        create: {
          productTypeId: sanitaryTypeId,
          name: attr.name,
          key: attr.key,
          dataType: attr.dataType,
          unit: attr.unit,
          options: attr.options ? JSON.stringify(attr.options) : null,
          sortOrder: attr.sortOrder,
        },
        update: {},
      });
    }
  }

  // 4. Map existing products to Tiles ProductType
  console.log("\n[4/4] Mapping existing products to ProductType = Tiles...");
  const tilesTypeId = typeMap.get("tiles")!;
  const boxUnitId = unitMap.get("box")!;
  const pcUnitId = unitMap.get("pc")!;
  const bagUnitId = unitMap.get("bag")!;

  const totalProducts = await db.product.count();
  console.log(`  Total Products in PostgreSQL: ${totalProducts}`);

  const updateResult = await db.product.updateMany({
    where: { productTypeId: null },
    data: { productTypeId: tilesTypeId },
  });
  console.log(`  Updated ${updateResult.count} Products with productTypeId = Tiles (ID: ${tilesTypeId})`);

  // Map units
  await db.product.updateMany({
    where: { unit: "Box" },
    data: { unitId: boxUnitId },
  });
  await db.product.updateMany({
    where: { unit: "Piece" },
    data: { unitId: pcUnitId },
  });
  await db.product.updateMany({
    where: { unit: "Bag/Unit" },
    data: { unitId: bagUnitId },
  });

  console.log("\n==========================================================================");
  console.log(" MIGRATION COMPLETE: Product Types & Units Successfully Provisioned");
  console.log("==========================================================================");
}

main().catch((err) => {
  console.error("[FATAL ERROR] Product types migration failed:", err);
  process.exit(1);
});
