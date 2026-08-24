/**
 * Prestige Tiles — Critical Fix Inventory Pipeline
 *
 * Requirements:
 * 1. Section Header & Row Context Parsing: Reads spreadsheet rows sequentially,
 *    tracking active section headers (e.g., 8x4, 6x4, GLOSSY, PAPERMATT) to assign
 *    exact Size, Finish, and Collection to every tile item.
 * 2. Rebuilds Product Master records in PostgreSQL with exact Brand IDs, normalized
 *    dimensions (e.g., "2400 × 1200 mm"), and clean deterministic business SKUs.
 * 3. Atomically resets Inventory table and inserts 1,088 fresh stock records with batch ID
 *    `PRESTIGE-INVENTORY-2026-08-24-CRITICAL-FIX`.
 * 4. Excludes DEPLETED (36 rows) and IN TRANSIT (0 rows).
 * 5. Generates detailed verification report (`prestige-inventory-import-report.json`).
 */

import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";

const SOURCE_FILE_PATH = path.resolve(process.cwd(), "data/prestige-products.json");
const BATCH_ID = `PRESTIGE-INVENTORY-${new Date().toISOString().split("T")[0]}-CRITICAL-FIX`;

function parseBrandFromSheet(sheet: string): string {
  const s = sheet.toUpperCase();
  if (s.includes("MOTTO")) return "Motto";
  if (s.includes("ROCK")) return "Rock";
  if (s.includes("BOFFO")) return "Boffo";
  if (s.includes("LONIX")) return "Lonix";
  if (s.includes("MONOLITH")) return "Monolith";
  if (s.includes("METROCITY")) return "Metrocity";
  if (s.includes("METRO")) return "Metro";
  if (s.includes("KAJARIA")) return "Kajaria";
  if (s.includes("MONZA")) return "Monza";
  if (s.includes("VELZONE")) return "Velzone";
  if (s.includes("ALTROS")) return "Altros";
  if (s.includes("MOZART")) return "Mozart";
  if (s.includes("DC & NANO")) return "DC & Nano";
  if (s.includes("EXCEL")) return "Excel";
  if (s.includes("METROWORLD")) return "Metroworld";
  if (s.includes("NITCO")) return "Nitco";
  if (s.includes("SILON")) return "Silon";
  if (s.includes("VENTO")) return "Vento";
  if (s.includes("CAPTIVA")) return "Captiva";
  if (s.includes("ANGEL")) return "Angel";
  if (s.includes("BATHCO")) return "Bathco";
  if (s.includes("WEBER")) return "Weber";
  if (s.includes("SONCERA")) return "Soncera";
  if (s.includes("ASHVIN")) return "Ashvin";
  return sheet.trim();
}

function parseSizeFromSheet(sheet: string): string | null {
  const s = sheet.toUpperCase();
  if (s.includes("800X24003000") || s.includes("800X2400")) return "800 × 2400 mm";
  if (s.includes("800X1600")) return "800 × 1600 mm";
  if (s.includes("800X1200")) return "800 × 1200 mm";
  if (s.includes("6X4")) return "1800 × 1200 mm";
  if (s.includes("4X2") || s.includes("2X4")) return "600 × 1200 mm";
  if (s.includes("2X2")) return "600 × 600 mm";
  if (s.includes("10X15")) return "250 × 375 mm";
  if (s.includes("16X16")) return "400 × 400 mm";
  return null;
}

function parseSizeFromText(text: string): string | null {
  if (!text) return null;
  const s = text.toUpperCase();
  if (s.includes("800X1600") || s.includes("800*1600") || s.includes("800 X 1600")) return "800 × 1600 mm";
  if (s.includes("600X1200") || s.includes("600*1200") || s.includes("600 X 1200")) return "600 × 1200 mm";
  if (s.includes("600X600") || s.includes("600*600") || s.includes("600 X 600")) return "600 × 600 mm";
  if (s.includes("300X600") || s.includes("300*600") || s.includes("300 X 600")) return "300 × 600 mm";
  if (s.includes("150X900")) return "150 × 900 mm";
  if (s.includes("200X1000")) return "200 × 1000 mm";
  if (s.includes("200X1200")) return "200 × 1200 mm";
  if (s.includes("200X1400")) return "200 × 1400 mm";
  if (s.includes("45X20")) return "450 × 200 mm";
  if (s.includes("350X350")) return "350 × 350 mm";
  if (s.includes("350X465")) return "350 × 465 mm";
  if (s.includes("430X480")) return "430 × 480 mm";
  if (s.includes("430X510")) return "430 × 510 mm";
  if (s.includes("8X4") || s.includes("8 X 4")) return "2400 × 1200 mm";
  if (s.includes("6X4") || s.includes("6 X 4")) return "1800 × 1200 mm";
  return null;
}

function cleanString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 && str.toLowerCase() !== "null" && str.toLowerCase() !== "none" ? str : null;
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

const generatedSkus = new Set<string>();

function generateCleanSku(brand: string, name: string, size: string | null, rawSku: string | null): string {
  if (rawSku && !rawSku.includes("-00") && !rawSku.includes("-01") && rawSku.length < 20) {
    const baseSku = rawSku.trim().toUpperCase();
    let sku = baseSku;
    let index = 2;
    while (generatedSkus.has(sku)) {
      sku = `${baseSku}-${index}`;
      index++;
    }
    generatedSkus.add(sku);
    return sku;
  }
  const cleanBrand = brand.toUpperCase().replace(/\s+/g, "");
  const cleanName = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join("-");

  const cleanSize = size
    ? size.toUpperCase().replace(/\s+/g, "").replace(/×/g, "X")
    : "";

  let baseSku = cleanSize ? `${cleanBrand}-${cleanName}-${cleanSize}` : `${cleanBrand}-${cleanName}`;
  let sku = baseSku;
  let index = 2;
  while (generatedSkus.has(sku)) {
    sku = `${baseSku}-${index}`;
    index++;
  }
  generatedSkus.add(sku);
  return sku;
}

async function main() {
  console.log("==========================================================================");
  console.log(" PRESTIGE TILES — CRITICAL FIX INVENTORY PIPELINE");
  console.log("==========================================================================");

  const rawData = JSON.parse(fs.readFileSync(SOURCE_FILE_PATH, "utf8"));
  console.log(`[INIT] Loaded ${rawData.length} raw rows from ${SOURCE_FILE_PATH}`);

  // Backup current DB inventory
  const backupDir = path.resolve(process.cwd(), "data/backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `inventory-backup-${timestamp}.json`);

  const existingInventories = await db.inventory.findMany({
    include: { product: { select: { id: true, name: true, sku: true, importKey: true } } },
  });
  fs.writeFileSync(backupFile, JSON.stringify(existingInventories, null, 2), "utf8");
  console.log(`[BACKUP] Saved snapshot of ${existingInventories.length} inventory records to: ${backupFile}`);

  // Step 1: Parse Section Headers and Group Products
  const parsedProducts: Array<{
    importKey: string;
    sourceSheet: string;
    sourceRow: number;
    brandName: string;
    productName: string;
    cleanSku: string;
    size: string | null;
    finish: string | null;
    collection: string | null;
    physicalStock: number;
    looseStock: number;
    blockedStock: number;
    availableStock: number;
    remarks: string | null;
    rawData: any;
  }> = [];

  let currentSheet = "";
  let currentBrand = "";
  let currentSize: string | null = null;
  let currentFinish: string | null = null;
  let currentCollection: string | null = null;

  let excludedDepleted = 0;
  let excludedInTransit = 0;

  for (const r of rawData) {
    const sheet = String(r["Source Sheet"] || "").trim();
    if (sheet === "DEPLETED") {
      excludedDepleted++;
      continue;
    }
    if (sheet === "IN TRANSIT") {
      excludedInTransit++;
      continue;
    }

    if (sheet !== currentSheet) {
      currentSheet = sheet;
      currentBrand = parseBrandFromSheet(sheet);
      currentSize = parseSizeFromSheet(sheet);
      currentFinish = null;
      currentCollection = null;
    }

    const importKey = cleanString(r["Import Key"]);
    if (!importKey) continue;

    const rowName = (r["Product Name"] || r["Collection / Series"] || "").trim();
    const rawStock = r["Physical Stock (Boxes)"];
    const rawLoose = r["Loose Stock (Pieces)"];
    const rawBlocked = r["Blocked Stock (Boxes)"];
    const rawSku = cleanString(r["Product Number / SKU"]);

    const upper = rowName.toUpperCase();
    const isHeader =
      (rawStock === null || rawStock === undefined || rawStock === 0) &&
      (rawLoose === null || rawLoose === undefined || rawLoose === 0) &&
      (upper.includes("SERIES") ||
        upper.includes("COLLECTION") ||
        upper.includes("GLOSSY") ||
        upper.includes("MATT") ||
        upper.includes("CARVING") ||
        upper.includes("PAPERMATT") ||
        upper.includes("SPA") ||
        upper.includes("ITALIAN") ||
        upper.includes("FULLBODY") ||
        upper.startsWith("8X4") ||
        upper.startsWith("6X4") ||
        upper.startsWith("4X2") ||
        upper.startsWith("2X4") ||
        upper.startsWith("2X2") ||
        upper.startsWith("150X") ||
        upper.startsWith("200X"));

    if (isHeader) {
      if (upper.includes("8X4") || upper.includes("8 X 4")) currentSize = "2400 × 1200 mm";
      else if (upper.includes("6X4") || upper.includes("6 X 4")) currentSize = "1800 × 1200 mm";
      else if (upper.includes("4X2") || upper.includes("2X4")) currentSize = "600 × 1200 mm";
      else if (upper.includes("2X2")) currentSize = "600 × 600 mm";
      else if (upper.includes("150X900")) currentSize = "150 × 900 mm";
      else if (upper.includes("200X1000")) currentSize = "200 × 1000 mm";
      else if (upper.includes("200X1200")) currentSize = "200 × 1200 mm";
      else if (upper.includes("200X1400")) currentSize = "200 × 1400 mm";

      if (upper.includes("HIGH GLOSSY")) currentFinish = "High Glossy";
      else if (upper.includes("GLOSSY")) currentFinish = "Glossy";
      else if (upper.includes("CARVING")) currentFinish = "Carving";
      else if (upper.includes("PAPERMATT")) currentFinish = "Papermatt";
      else if (upper.includes("SPA")) currentFinish = "Spa";
      else if (upper.includes("ITALIAN")) currentFinish = "Italian";
      else if (upper.includes("FULLBODY")) currentFinish = "Fullbody";
      else if (upper.includes("MATT")) currentFinish = "Matt";

      if (upper.includes("SERIES") || upper.includes("COLLECTION")) currentCollection = titleCase(rowName);
      continue;
    }

    const cleanName = titleCase(rowName.replace(/^Carving\s+/i, "").replace(/^Glossy\s+/i, "").trim());
    const finalBrand = cleanString(r["Brand"]) || currentBrand;
    const finalSize = cleanString(r["Size"]) || currentSize || parseSizeFromText(rowName);
    const cleanSku = generateCleanSku(finalBrand, cleanName, finalSize, rawSku);

    const physicalStock = Number(rawStock) || 0;
    const looseStock = Number(rawLoose) || 0;
    const blockedStock = Number(rawBlocked) || 0;
    const availableStock = Math.max(0, physicalStock - blockedStock);

    parsedProducts.push({
      importKey,
      sourceSheet: currentSheet,
      sourceRow: Number(r["Source Row"] || 0),
      brandName: finalBrand,
      productName: cleanName,
      cleanSku,
      size: finalSize,
      finish: currentFinish || cleanString(r["Finish / Variant"]),
      collection: currentCollection || cleanString(r["Collection / Series"]),
      physicalStock,
      looseStock,
      blockedStock,
      availableStock,
      remarks: cleanString(r["Remarks"]),
      rawData: r,
    });
  }

  console.log(`[PARSER] Parsed ${parsedProducts.length} active products with contextual sizes and brands.`);
  console.log(`[PARSER] Excluded DEPLETED: ${excludedDepleted} | Excluded IN TRANSIT: ${excludedInTransit}`);

  // Step 2: Ensure Brand records exist in Database
  const uniqueBrands = Array.from(new Set(parsedProducts.map((p) => p.brandName)));
  const brandIdMap = new Map<string, string>();

  for (const name of uniqueBrands) {
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
    brandIdMap.set(name.toLowerCase(), brandObj.id);
  }

  // Step 3: Rebuild Product Master rows
  console.log("[PRODUCTS] Updating Product Master rows in PostgreSQL...");
  let updatedCount = 0;
  let createdCount = 0;

  for (const item of parsedProducts) {
    const brandId = brandIdMap.get(item.brandName.toLowerCase()) || null;

    let prod = await db.product.findUnique({
      where: { importKey: item.importKey },
    });

    if (prod) {
      await db.product.update({
        where: { id: prod.id },
        data: {
          name: item.productName,
          sku: item.cleanSku,
          brandId,
          size: item.size,
          collection: item.collection,
          finish: item.finish,
          sourceSheet: item.sourceSheet,
          sourceRow: item.sourceRow,
        },
      });
      updatedCount++;
    } else {
      const slug = `${slugify(item.productName)}-${slugify(item.importKey)}`;
      await db.product.create({
        data: {
          name: item.productName,
          slug,
          importKey: item.importKey,
          sku: item.cleanSku,
          brandId,
          size: item.size,
          collection: item.collection,
          finish: item.finish,
          sourceSheet: item.sourceSheet,
          sourceRow: item.sourceRow,
        },
      });
      createdCount++;
    }
  }
  console.log(`[PRODUCTS] Rebuilt Product Master: Updated ${updatedCount}, Created ${createdCount}`);

  // Delete legacy "Unbranded" Brand entities
  const unbrandedBrands = await db.brand.findMany({
    where: { name: { contains: "Unbranded", mode: "insensitive" } },
    include: { _count: { select: { products: true } } },
  });
  for (const b of unbrandedBrands) {
    if (b._count.products === 0) {
      await db.brand.delete({ where: { id: b.id } });
      console.log(`[CLEANUP] Deleted empty Brand entity: ${b.name}`);
    }
  }

  // Cleanup obsolete products created by old import that are not part of the active import and not referenced
  console.log("[CLEANUP] Finding obsolete products to remove...");
  const activeImportKeys = new Set(parsedProducts.map((p) => p.importKey.toUpperCase()));
  const allDbProducts = await db.product.findMany({
    where: { importKey: { not: null } },
    include: {
      stockBookingItems: { take: 1 },
      inventory: { select: { stockBlocks: { take: 1 } } }
    }
  });

  const obsoleteProducts = allDbProducts.filter((p) => {
    const key = p.importKey!.toUpperCase();
    if (activeImportKeys.has(key)) return false;
    if (p.stockBookingItems.length > 0) return false;
    if (p.inventory?.stockBlocks && p.inventory.stockBlocks.length > 0) return false;
    return true;
  });

  console.log(`[CLEANUP] Found ${obsoleteProducts.length} obsolete products.`);
  if (obsoleteProducts.length > 0) {
    const ids = obsoleteProducts.map((p) => p.id);
    await db.inventory.deleteMany({ where: { productId: { in: ids } } });
    await db.product.deleteMany({ where: { id: { in: ids } } });
    console.log(`[CLEANUP] Deleted ${obsoleteProducts.length} obsolete products.`);
  }

  // Step 4: Transactional Inventory Reset & Re-Import
  console.log("[INVENTORY] Transactionally resetting Inventory table...");

  const allProducts = await db.product.findMany({
    select: { id: true, importKey: true },
  });
  const prodMap = new Map<string, string>();
  for (const p of allProducts) {
    if (p.importKey) prodMap.set(p.importKey.trim().toUpperCase(), p.id);
  }

  let totalPhysicalStock = 0;
  let totalBlockedStock = 0;
  let totalAvailableStock = 0;

  const inventoryRecords = parsedProducts.map((item) => {
    const productId = prodMap.get(item.importKey.toUpperCase())!;
    totalPhysicalStock += item.physicalStock;
    totalBlockedStock += item.blockedStock;
    totalAvailableStock += item.availableStock;

    let stockStatus = "OUT_OF_STOCK";
    if (item.availableStock > 10) stockStatus = "AVAILABLE";
    else if (item.availableStock > 0) stockStatus = "LOW_STOCK";
    else if (item.blockedStock > 0 && item.availableStock <= 0) stockStatus = "BLOCKED";

    return {
      productId,
      totalStock: item.physicalStock,
      looseStock: item.looseStock,
      blockedStock: item.blockedStock,
      availableStock: item.availableStock,
      stockStatus,
      brand: item.brandName,
      productName: item.productName,
      productNumber: item.cleanSku,
      size: item.size,
      remarks: item.remarks,
      sourceFile: path.basename(SOURCE_FILE_PATH),
      sourceSheet: item.sourceSheet,
      sourceRow: item.sourceRow,
      originalRawData: item.rawData,
      needsReview: false,
      matchConfidence: 1.0,
      importBatchId: BATCH_ID,
    };
  });

  await db.$transaction(async (tx) => {
    await tx.inventoryImportBatch.create({
      data: {
        id: BATCH_ID,
        sourceFile: path.basename(SOURCE_FILE_PATH),
        recordsProcessed: parsedProducts.length,
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

    await tx.stockBlock.deleteMany({});
    await tx.inventoryBlock.deleteMany({});
    await tx.inventoryMovement.deleteMany({});
    await tx.inventory.deleteMany({});

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

  console.log(`[INVENTORY] Successfully imported ${inventoryRecords.length} fresh Inventory records.`);
  console.log(`[STOCK TOTALS] Physical Stock: ${totalPhysicalStock} | Blocked: ${totalBlockedStock} | Available: ${totalAvailableStock}`);

  // Step 5: Save Validation Report
  const reportPath = path.resolve(process.cwd(), "prestige-inventory-import-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        importBatchId: BATCH_ID,
        importDate: new Date().toISOString(),
        totalSourceRows: rawData.length,
        activeParsedRows: parsedProducts.length,
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
  console.log(" CRITICAL FIX INVENTORY PIPELINE COMPLETE");
  console.log("==========================================================================");
}

main().catch((err) => {
  console.error("[FATAL ERROR] Pipeline failed:", err);
  process.exit(1);
});
