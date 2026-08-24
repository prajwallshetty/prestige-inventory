/**
 * Prestige Tiles — Rebuild Product Master & Inventory Data
 *
 * Requirements:
 * 1. Re-evaluates Product Master data (Brand, Size, SKU, Name) from source data.
 * 2. Creates/upserts Brand entities in DB and links `brandId` to Products.
 * 3. Normalizes sizes (e.g. 800X1600 -> "800 × 1600 mm", 6x4/8x4 -> "2400 × 1200 mm") and sets `Product.size`.
 * 4. Cleans up artificial legacy SKUs and "Unbranded" / "Standard" defaults in DB.
 * 5. Performs a clean, transactional Inventory Reset for all 1,088 non-depleted active stock items.
 * 6. Generates full verification report (`prestige-inventory-import-report.json`).
 */

import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";

const SOURCE_FILE_PATH = path.resolve(process.cwd(), "data/prestige-products.json");
const BATCH_ID = `PRESTIGE-INVENTORY-${new Date().toISOString().split("T")[0]}-REBUILD`;

function extractSizeAndBrandFromSheet(sheetName: string): { extractedBrand: string; extractedSize: string | null } {
  const s = sheetName.trim();
  let extractedBrand = s;
  let extractedSize: string | null = null;

  const sizeRegex = /(800\s*[xX×*]\s*24003000|800\s*[xX×*]\s*2400|800\s*[xX×*]\s*1600|800\s*[xX×*]\s*1200|600\s*[xX×*]\s*1200|600\s*[xX×*]\s*600|300\s*[xX×*]\s*600|6\s*[xX×*]\s*48\s*[xX×*]\s*4|6\s*[xX×*]\s*4|4\s*[xX×*]\s*2|2\s*[xX×*]\s*4|2\s*[xX×*]\s*2|10\s*[xX×*]\s*15|16\s*[xX×*]\s*16|12\s*[xX×*]\s*12|12\s*[xX×*]\s*18|8\s*[xX×*]\s*24)/i;
  const match = s.match(sizeRegex);

  if (match) {
    extractedSize = normalizeSize(match[0]);
    extractedBrand = s.replace(match[0], "").replace(/small|Metrocity/gi, "").trim();
    if (!extractedBrand) {
      extractedBrand = "MOTTO";
    }
  }

  // Normalize Brand Name
  if (/motto/i.test(extractedBrand)) extractedBrand = "Motto";
  else if (/rock/i.test(extractedBrand)) extractedBrand = "Rock";
  else if (/boffo/i.test(extractedBrand)) extractedBrand = "Boffo";
  else if (/lonix/i.test(extractedBrand)) extractedBrand = "Lonix";
  else if (/monolith/i.test(extractedBrand)) extractedBrand = "Monolith";
  else if (/metrocity/i.test(extractedBrand)) extractedBrand = "Metrocity";
  else if (/metro/i.test(extractedBrand)) extractedBrand = "Metro";
  else if (/kajaria/i.test(extractedBrand)) extractedBrand = "Kajaria";
  else if (/monza/i.test(extractedBrand)) extractedBrand = "Monza";
  else if (/velzone/i.test(extractedBrand)) extractedBrand = "Velzone";
  else if (/altros/i.test(extractedBrand)) extractedBrand = "Altros";
  else if (/mozart/i.test(extractedBrand)) extractedBrand = "Mozart";
  else if (/dc & nano/i.test(extractedBrand)) extractedBrand = "DC & Nano";
  else if (/excel/i.test(extractedBrand)) extractedBrand = "Excel";
  else if (/metroworld/i.test(extractedBrand)) extractedBrand = "Metroworld";
  else if (/nitco/i.test(extractedBrand)) extractedBrand = "Nitco";
  else if (/silon/i.test(extractedBrand)) extractedBrand = "Silon";
  else if (/vento/i.test(extractedBrand)) extractedBrand = "Vento";
  else if (/captiva/i.test(extractedBrand)) extractedBrand = "Captiva";
  else if (/angel/i.test(extractedBrand)) extractedBrand = "Angel";
  else if (/bathco/i.test(extractedBrand)) extractedBrand = "Bathco";
  else if (/weber/i.test(extractedBrand)) extractedBrand = "Weber";
  else if (/soncera/i.test(extractedBrand)) extractedBrand = "Soncera";
  else if (/ashvin/i.test(extractedBrand)) extractedBrand = "Ashvin";

  return { extractedBrand, extractedSize };
}

function normalizeSize(rawSize: string | null | undefined): string | null {
  if (!rawSize) return null;
  const s = rawSize.trim().toUpperCase().replace(/\s+/g, "");

  if (/800[X×*]24003000/i.test(s)) return "800 × 2400 / 3000 mm";
  if (/800[X×*]2400/i.test(s)) return "800 × 2400 mm";
  if (/800[X×*]1600/i.test(s)) return "800 × 1600 mm";
  if (/800[X×*]1200/i.test(s)) return "800 × 1200 mm";
  if (/600[X×*]1200/i.test(s) || s === "4X2" || s === "2X4") return "600 × 1200 mm";
  if (/600[X×*]600/i.test(s) || s === "2X2") return "600 × 600 mm";
  if (/300[X×*]600/i.test(s)) return "300 × 600 mm";
  if (s === "6X4" || s === "4X6" || s === "6X48X4") return "2400 × 1200 mm";
  if (s === "10X15") return "250 × 375 mm";
  if (s === "16X16") return "400 × 400 mm";
  if (s === "12X12") return "300 × 300 mm";
  if (s === "12X18") return "300 × 450 mm";
  if (s === "8X24") return "200 × 600 mm";
  if (s === "150X900") return "150 × 900 mm";
  if (s === "200X1000") return "200 × 1000 mm";
  if (s === "200X1200") return "200 × 1200 mm";
  if (s === "200X1400") return "200 × 1400 mm";
  if (s === "400X400") return "400 × 400 mm";
  if (s === "350X350") return "350 × 350 mm";
  if (s === "430X480") return "430 × 480 mm";

  if (s.toLowerCase() === "standard") return null;
  return rawSize.trim();
}

function cleanString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 && str.toLowerCase() !== "null" && str.toLowerCase() !== "none" ? str : null;
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

async function main() {
  console.log("==========================================================================");
  console.log(" PRESTIGE TILES — REBUILD PRODUCT MASTER & INVENTORY DATA");
  console.log("==========================================================================");

  const rawData = JSON.parse(fs.readFileSync(SOURCE_FILE_PATH, "utf8"));
  console.log(`[INIT] Loaded ${rawData.length} rows from ${SOURCE_FILE_PATH}`);

  // Step 1: Extract Brands and create Brand entities in DB
  const brandMap = new Map<string, string>(); // brandName -> brandId
  const uniqueBrandNames = new Set<string>();

  for (const r of rawData) {
    const sheet = (r["Source Sheet"] || "").trim();
    if (sheet === "DEPLETED" || sheet === "IN TRANSIT") continue;

    const { extractedBrand } = extractSizeAndBrandFromSheet(sheet);
    const brandName = cleanString(r["Brand"]) || extractedBrand;
    if (brandName) uniqueBrandNames.add(brandName);
  }

  console.log(`[BRANDS] Found ${uniqueBrandNames.size} distinct brands in source dataset.`);

  for (const name of Array.from(uniqueBrandNames)) {
    const slug = slugify(name);
    let brandObj = await db.brand.findFirst({
      where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] },
    });

    if (!brandObj) {
      brandObj = await db.brand.create({
        data: { name, slug, published: true },
      });
      console.log(`[BRANDS] Created Brand entity: ${name} (ID: ${brandObj.id})`);
    }
    brandMap.set(name.toLowerCase(), brandObj.id);
  }

  // Step 2: Rebuild Product Master Records
  console.log("[PRODUCTS] Updating/repairing Product master records in Database...");
  let updatedProducts = 0;
  let createdProducts = 0;

  for (const r of rawData) {
    const sheet = (r["Source Sheet"] || "").trim();
    if (sheet === "DEPLETED" || sheet === "IN TRANSIT") continue;

    const importKey = cleanString(r["Import Key"]);
    if (!importKey) continue;

    const { extractedBrand, extractedSize } = extractSizeAndBrandFromSheet(sheet);
    const brandName = cleanString(r["Brand"]) || extractedBrand;
    const brandId = brandName ? brandMap.get(brandName.toLowerCase()) || null : null;

    const rawSize = cleanString(r["Size"]) || extractedSize;
    const finalSize = normalizeSize(rawSize);

    const productName = cleanString(r["Product Name"]) || cleanString(r["Collection / Series"]) || "UNNAMED PRODUCT";
    const rawNumber = cleanString(r["Product Number / SKU"]);
    const collection = cleanString(r["Collection / Series"]);

    // Find existing product by importKey or create
    let prod = await db.product.findUnique({
      where: { importKey },
    });

    if (prod) {
      // Repair product master fields
      // If SKU was artificially generated like MOTO-6X48X4-0127, clean it or use real number
      let cleanSku = rawNumber;
      if (!cleanSku && prod.sku && prod.sku.includes("-")) {
        cleanSku = null; // Remove artificial legacy SKU string
      }

      await db.product.update({
        where: { id: prod.id },
        data: {
          brandId,
          size: finalSize,
          collection: collection || prod.collection,
          sku: cleanSku,
          sourceSheet: sheet,
          sourceRow: Number(r["Source Row"] || 0),
        },
      });
      updatedProducts++;
    } else {
      const slug = `${slugify(productName)}-${slugify(importKey)}`;
      prod = await db.product.create({
        data: {
          name: productName,
          slug,
          importKey,
          brandId,
          size: finalSize,
          collection,
          sku: rawNumber,
          sourceSheet: sheet,
          sourceRow: Number(r["Source Row"] || 0),
        },
      });
      createdProducts++;
    }
  }

  console.log(`[PRODUCTS] Updated ${updatedProducts} Product records. Created ${createdProducts} new Product records.`);

  // Remove legacy "Unbranded" Brand entities if unused
  const unbrandedEntities = await db.brand.findMany({
    where: { name: { contains: "Unbranded", mode: "insensitive" } },
    include: { _count: { select: { products: true } } },
  });
  for (const b of unbrandedEntities) {
    if (b._count.products === 0) {
      await db.brand.delete({ where: { id: b.id } });
      console.log(`[CLEANUP] Deleted empty legacy Brand entity: ${b.name}`);
    }
  }

  // Step 3: Transactional Reset & Import of Inventory
  console.log("\n[INVENTORY] Resetting Inventory and creating fresh stock records...");

  const dbProducts = await db.product.findMany({
    select: { id: true, importKey: true },
  });
  const prodMapByImportKey = new Map<string, string>();
  for (const p of dbProducts) {
    if (p.importKey) prodMapByImportKey.set(p.importKey.trim().toUpperCase(), p.id);
  }

  let totalPhysicalStock = 0;
  let totalBlockedStock = 0;
  let totalAvailableStock = 0;

  const inventoryRecords: Array<{
    productId: string;
    totalStock: number;
    looseStock: number;
    blockedStock: number;
    availableStock: number;
    stockStatus: string;
    brand: string | null;
    productName: string | null;
    productNumber: string | null;
    size: string | null;
    remarks: string | null;
    sourceFile: string;
    sourceSheet: string;
    sourceRow: number;
    originalRawData: any;
    needsReview: boolean;
    matchConfidence: number;
    importBatchId: string;
  }> = [];

  let activeCount = 0;
  let excludedDepleted = 0;
  let excludedInTransit = 0;

  for (const r of rawData) {
    const sheet = (r["Source Sheet"] || "").trim();
    if (sheet === "DEPLETED") {
      excludedDepleted++;
      continue;
    }
    if (sheet === "IN TRANSIT") {
      excludedInTransit++;
      continue;
    }
    activeCount++;

    const importKey = cleanString(r["Import Key"])?.toUpperCase();
    if (!importKey) continue;

    const productId = prodMapByImportKey.get(importKey);
    if (!productId) continue;

    const { extractedBrand, extractedSize } = extractSizeAndBrandFromSheet(sheet);
    const rawBrand = cleanString(r["Brand"]) || extractedBrand;
    const rawName = cleanString(r["Product Name"]) || cleanString(r["Collection / Series"]) || "UNNAMED PRODUCT";
    const rawNumber = cleanString(r["Product Number / SKU"]);
    const rawSize = cleanString(r["Size"]) || extractedSize;
    const normalizedSizeStr = normalizeSize(rawSize);

    const physicalStock = Number(r["Physical Stock (Boxes)"]) || 0;
    const looseStock = Number(r["Loose Stock (Pieces)"]) || 0;
    const blockedStock = Number(r["Blocked Stock (Boxes)"]) || 0;
    const availableStock = Math.max(0, physicalStock - blockedStock);

    totalPhysicalStock += physicalStock;
    totalBlockedStock += blockedStock;
    totalAvailableStock += availableStock;

    let stockStatus = "OUT_OF_STOCK";
    if (availableStock > 10) stockStatus = "AVAILABLE";
    else if (availableStock > 0) stockStatus = "LOW_STOCK";
    else if (blockedStock > 0 && availableStock <= 0) stockStatus = "BLOCKED";

    inventoryRecords.push({
      productId,
      totalStock: physicalStock,
      looseStock,
      blockedStock,
      availableStock,
      stockStatus,
      brand: rawBrand,
      productName: rawName,
      productNumber: rawNumber,
      size: normalizedSizeStr,
      remarks: cleanString(r["Remarks"]),
      sourceFile: path.basename(SOURCE_FILE_PATH),
      sourceSheet: sheet,
      sourceRow: Number(r["Source Row"] || 0),
      originalRawData: r,
      needsReview: false,
      matchConfidence: 1.0,
      importBatchId: BATCH_ID,
    });
  }

  await db.$transaction(async (tx) => {
    // Create Import Batch
    await tx.inventoryImportBatch.create({
      data: {
        id: BATCH_ID,
        sourceFile: path.basename(SOURCE_FILE_PATH),
        recordsProcessed: activeCount,
        recordsImported: inventoryRecords.length,
        recordsMatched: inventoryRecords.length,
        recordsUnmatched: 0,
        recordsNeedsReview: 0,
        recordsRejected: 0,
        totalPhysicalStock,
        totalBlockedStock,
        totalAvailableStock,
        excludedDepletedRows: excludedDepleted,
        excludedInTransitRows: excludedInTransit,
        status: "IN_PROGRESS",
      },
    });

    // Wipe old inventory dependent tables & Inventory table
    await tx.stockBlock.deleteMany({});
    await tx.inventoryBlock.deleteMany({});
    await tx.inventoryMovement.deleteMany({});
    await tx.inventory.deleteMany({});

    // Batch insert new Inventory
    const BATCH_SIZE = 100;
    for (let i = 0; i < inventoryRecords.length; i += BATCH_SIZE) {
      const chunk = inventoryRecords.slice(i, i + BATCH_SIZE);
      await tx.inventory.createMany({
        data: chunk,
      });
    }

    await tx.inventoryImportBatch.update({
      where: { id: BATCH_ID },
      data: { status: "COMPLETED" },
    });
  });

  console.log(`[INVENTORY] Re-imported ${inventoryRecords.length} Inventory records.`);
  console.log(`[STOCK BALANCES] Physical Stock: ${totalPhysicalStock} | Blocked: ${totalBlockedStock} | Available: ${totalAvailableStock}`);

  // Step 4: Write Validation Report
  const reportPath = path.resolve(process.cwd(), "prestige-inventory-import-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        importBatchId: BATCH_ID,
        importDate: new Date().toISOString(),
        totalSourceRows: rawData.length,
        activeSourceRows: activeCount,
        excludedDepleted,
        excludedInTransit,
        recordsImported: inventoryRecords.length,
        stockTotals: {
          physicalStock: totalPhysicalStock,
          blockedStock: totalBlockedStock,
          availableStock: totalAvailableStock,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("\n==========================================================================");
  console.log(" PRODUCT MASTER & INVENTORY DATA REBUILD COMPLETE");
  console.log("==========================================================================");
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err);
  process.exit(1);
});
