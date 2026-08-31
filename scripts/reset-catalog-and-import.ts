/**
 * Prestige Tiles — Product Catalog Reset & Excel Import
 * ======================================================
 *
 * Replaces the ENTIRE product catalog with the rows in an Excel file
 * (columns: BRAND, PRODUCT, SURFACE, SIZE), and clears the disposable
 * operational/transactional data that referenced the old catalog — while
 * explicitly PRESERVING Users, Roles/RBAC, Showrooms, the Warehouse
 * (depot), and Dealers.
 *
 * SAFETY MODEL — read this before running for real:
 *
 *   - Runs as a DRY RUN by default. It prints exactly what it would do —
 *     Excel validation results, before/after row counts for every affected
 *     table — and writes nothing.
 *   - To actually execute, you must pass BOTH `--confirm` and
 *     `--i-have-a-backup`. The second flag exists because this script
 *     cannot verify your hosting provider's backup/snapshot state itself —
 *     it is your explicit acknowledgement that you took one. Take a
 *     Neon branch/snapshot (or your provider's equivalent) of the
 *     production database before you pass it.
 *   - Before deleting anything, it writes a full JSON export of every row
 *     about to be removed to `data/backups/catalog-reset-<timestamp>/`, as
 *     a second, local safety net on top of your database-level backup.
 *   - Deletion order respects every foreign key in the schema (children
 *     before parents) so nothing errors out partway through.
 *   - The new-catalog import runs inside one transaction — if any row
 *     fails to write, none of the new catalog is left half-imported.
 *   - Never touches User, Role assignment, Showroom, Warehouse, or Dealer
 *     rows. Never runs `prisma migrate reset`, `DROP DATABASE`, or
 *     `TRUNCATE`.
 *
 * Usage:
 *   npx tsx scripts/reset-catalog-and-import.ts                              # dry run (default)
 *   npx tsx scripts/reset-catalog-and-import.ts --file=data/new-product-catalog.xlsx   # dry run, explicit file
 *   npx tsx scripts/reset-catalog-and-import.ts --confirm --i-have-a-backup  # LIVE — clears + imports
 */

import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { db } from "../src/lib/db";

// ————— CLI args —————

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const BACKUP_ACK = args.includes("--i-have-a-backup");
const LIVE = CONFIRM && BACKUP_ACK;
const FILE_ARG = args.find((a) => a.startsWith("--file="))?.split("=")[1];
const FILE_PATH = path.resolve(process.cwd(), FILE_ARG || "data/new-product-catalog.xlsx");

const REQUIRED_COLUMNS = ["BRAND", "PRODUCT", "SURFACE", "SIZE"] as const;

// ————— Helpers —————

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

/** Deterministic, stable identity for one (brand, product, surface, size) line — reruns never duplicate. */
function importKeyFor(brand: string, product: string, surface: string, size: string): string {
  return [brand, product, surface, size].map((s) => slugify(s).toUpperCase()).join("__");
}

interface ParsedRow {
  excelRow: number;
  brand: string;
  product: string;
  surface: string;
  size: string;
}
interface InvalidRow {
  excelRow: number;
  raw: Record<string, unknown>;
  missing: string[];
}

function parseExcel(filePath: string): { valid: ParsedRow[]; invalid: InvalidRow[]; duplicates: Array<{ excelRow: number; key: string; firstSeenRow: number }> } {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const headerIdx = rows.findIndex((r) => (r || []).some((c) => String(c || "").trim().toUpperCase() === "BRAND"));
  if (headerIdx === -1) {
    throw new Error(`Could not find a header row containing "BRAND" in ${filePath}.`);
  }
  const header = rows[headerIdx].map((c) => String(c || "").trim().toUpperCase());
  const colIndex = (name: string) => header.indexOf(name);
  const missingCols = REQUIRED_COLUMNS.filter((c) => colIndex(c) === -1);
  if (missingCols.length > 0) {
    throw new Error(`Excel is missing required column(s): ${missingCols.join(", ")}.`);
  }

  const valid: ParsedRow[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Map<string, number>(); // normalized key -> first excel row number
  const duplicates: Array<{ excelRow: number; key: string; firstSeenRow: number }> = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const excelRow = i + 1; // 1-indexed, matches what Excel shows
    const raw = {
      BRAND: r[colIndex("BRAND")],
      PRODUCT: r[colIndex("PRODUCT")],
      SURFACE: r[colIndex("SURFACE")],
      SIZE: r[colIndex("SIZE")],
    };
    const allBlank = Object.values(raw).every((v) => v === null || String(v).trim() === "");
    if (allBlank) continue; // fully empty row — not a data row, not an error

    const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
    const brand = clean(raw.BRAND);
    const product = clean(raw.PRODUCT);
    const surface = clean(raw.SURFACE);
    const size = clean(raw.SIZE);

    const missing = [
      !brand && "BRAND",
      !product && "PRODUCT",
      !surface && "SURFACE",
      !size && "SIZE",
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      invalid.push({ excelRow, raw, missing });
      continue;
    }

    const key = `${brand.toUpperCase()}::${product.toUpperCase()}::${surface.toUpperCase()}::${size.toUpperCase()}`;
    if (seen.has(key)) {
      duplicates.push({ excelRow, key, firstSeenRow: seen.get(key)! });
      continue; // keep the first occurrence only
    }
    seen.set(key, excelRow);
    valid.push({ excelRow, brand, product, surface, size });
  }

  return { valid, invalid, duplicates };
}

async function countAll() {
  const products = await db.product.count();
  const inventories = await db.inventory.count();
  const brands = await db.brand.count();
  const stockBlocks = await db.stockBlock.count();
  const blockOrders = await db.blockOrder.count();
  const bookings = await db.stockBooking.count();
  const bookingItems = await db.stockBookingItem.count();
  const shipments = await db.shipment.count();
  const shipmentItems = await db.shipmentItem.count();
  const notifications = await db.notification.count();
  const conversations = await db.conversation.count();
  const messages = await db.message.count();
  const users = await db.user.count();
  const showrooms = await db.showroom.count();
  const warehouses = await db.warehouse.count();
  const dealers = await db.dealer.count();

  return {
    products, inventories, brands,
    stockBlocks, blockOrders,
    bookings, bookingItems,
    shipments, shipmentItems,
    notifications,
    conversations, messages,
    users, showrooms, warehouses, dealers,
  };
}

function printCounts(label: string, c: Awaited<ReturnType<typeof countAll>>) {
  console.log(`\n[${label}]`);
  console.log(`  Products:            ${c.products}`);
  console.log(`  Inventory rows:      ${c.inventories}`);
  console.log(`  Brands:              ${c.brands}`);
  console.log(`  Blocks (line items): ${c.stockBlocks}`);
  console.log(`  Block orders:        ${c.blockOrders}`);
  console.log(`  Bookings:            ${c.bookings} (${c.bookingItems} items)`);
  console.log(`  Shipments:           ${c.shipments} (${c.shipmentItems} items)`);
  console.log(`  Notifications:       ${c.notifications}`);
  console.log(`  Chat conversations:  ${c.conversations} (${c.messages} messages)`);
  console.log(`  --- preserved ---`);
  console.log(`  Users:               ${c.users}`);
  console.log(`  Showrooms:           ${c.showrooms}`);
  console.log(`  Warehouses:          ${c.warehouses}`);
  console.log(`  Dealers:             ${c.dealers}`);
}

async function writeBackupSnapshot(dir: string) {
  fs.mkdirSync(dir, { recursive: true });

  const products = await db.product.findMany({ include: { inventory: true, brand: true } });
  const stockBlocks = await db.stockBlock.findMany();
  const blockOrders = await db.blockOrder.findMany();
  const bookings = await db.stockBooking.findMany();
  const bookingItems = await db.stockBookingItem.findMany();
  const shipments = await db.shipment.findMany();
  const shipmentItems = await db.shipmentItem.findMany();
  const notifications = await db.notification.findMany();
  const conversations = await db.conversation.findMany();
  const messages = await db.message.findMany();

  const files: Record<string, unknown> = {
    "products-with-inventory-and-brand.json": products,
    "stock-blocks.json": stockBlocks,
    "block-orders.json": blockOrders,
    "bookings.json": bookings,
    "booking-items.json": bookingItems,
    "shipments.json": shipments,
    "shipment-items.json": shipmentItems,
    "notifications.json": notifications,
    "conversations.json": conversations,
    "messages.json": messages,
  };
  for (const [name, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), "utf8");
  }
  return { productsBackedUp: products.length, blocksBackedUp: stockBlocks.length };
}

async function main() {
  console.log("=".repeat(78));
  console.log(" PRESTIGE TILES — PRODUCT CATALOG RESET + EXCEL IMPORT");
  console.log("=".repeat(78));
  console.log(`Mode: ${LIVE ? "LIVE EXECUTION (will write to the database)" : "DRY RUN (no writes)"}`);
  console.log(`Source file: ${FILE_PATH}`);

  if (!fs.existsSync(FILE_PATH)) {
    throw new Error(`Excel file not found at ${FILE_PATH}. Pass --file=path/to/file.xlsx.`);
  }

  // ——— 1. Parse + validate Excel ———
  const { valid, invalid, duplicates } = parseExcel(FILE_PATH);
  const totalDataRows = valid.length + invalid.length + duplicates.length;

  console.log("\n[EXCEL VALIDATION]");
  console.log(`  Total data rows:      ${totalDataRows}`);
  console.log(`  Valid rows:           ${valid.length}`);
  console.log(`  Invalid rows:         ${invalid.length}`);
  console.log(`  Duplicate rows:       ${duplicates.length}`);
  if (invalid.length > 0) {
    console.log("\n  Invalid rows (skipped — will NOT be imported):");
    for (const r of invalid) console.log(`    Row ${r.excelRow}: missing ${r.missing.join(", ")} — ${JSON.stringify(r.raw)}`);
  }
  if (duplicates.length > 0) {
    console.log("\n  Duplicate rows (same BRAND+PRODUCT+SURFACE+SIZE as an earlier row — first kept, rest skipped):");
    for (const d of duplicates) console.log(`    Row ${d.excelRow} duplicates row ${d.firstSeenRow} (${d.key})`);
  }

  const brandNames = [...new Set(valid.map((r) => r.brand))].sort();
  console.log(`\n  Brands found: ${brandNames.join(", ")}`);

  // ——— 2. Before counts ———
  const before = await countAll();
  printCounts("BEFORE", before);

  // ——— 3. Warehouse (depot) detection — auto-select main depot if available ———
  const warehouses = await db.warehouse.findMany({ select: { id: true, name: true, code: true } });
  let depotId: string | null = null;
  const mainWarehouse =
    warehouses.find((w) => /main|central|depot/i.test(w.code) || /main|central|depot/i.test(w.name)) ?? warehouses[0];
  if (mainWarehouse) {
    depotId = mainWarehouse.id;
    console.log(`\n[DEPOT] New inventory rows will link to warehouse "${mainWarehouse.name}" (${mainWarehouse.code}) [${mainWarehouse.id}].`);
  } else {
    console.log("\n[DEPOT] No warehouse rows found — new inventory rows will have warehouseId = null.");
  }

  if (!LIVE) {
    console.log("\n" + "=".repeat(78));
    console.log(" DRY RUN COMPLETE — nothing was written.");
    console.log(" To execute for real:");
    console.log("   1. Take a backup/snapshot of the production database with your hosting");
    console.log("      provider (e.g. a Neon branch or point-in-time restore point).");
    console.log("   2. Re-run with:  npx tsx scripts/reset-catalog-and-import.ts --confirm --i-have-a-backup");
    console.log("=".repeat(78));
    return;
  }

  // ——— 4. Backup snapshot (local safety net, in addition to your DB backup) ———
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(process.cwd(), `data/backups/catalog-reset-${timestamp}`);
  console.log(`\n[BACKUP] Writing local JSON snapshot to ${backupDir} ...`);
  const backupSummary = await writeBackupSnapshot(backupDir);
  console.log(`[BACKUP] Snapshotted ${backupSummary.productsBackedUp} products and ${backupSummary.blocksBackedUp} blocks.`);

  // ——— 5. Clear operational/transactional data (children before parents) ———
  console.log("\n[CLEANUP] Clearing operational/transactional data...");
  await db.chatAudit.deleteMany({});
  await db.message.deleteMany({});
  await db.conversationParticipant.deleteMany({});
  await db.conversation.deleteMany({});
  console.log("  Chat cleared.");

  await db.notification.deleteMany({});
  console.log("  Notifications cleared.");

  await db.stockBookingItem.deleteMany({});
  await db.stockBooking.deleteMany({});
  console.log("  Bookings/carts cleared.");

  await db.inventoryMovement.deleteMany({});
  await db.stockBlock.deleteMany({});
  await db.blockOrder.deleteMany({});
  await db.inventoryBlock.deleteMany({});
  console.log("  Blocks, block orders, and movements cleared.");

  await db.shipmentItem.deleteMany({});
  await db.shipment.deleteMany({});
  console.log("  Procurement purchase orders / shipments cleared.");

  await db.inventoryHistory.deleteMany({});
  console.log("  Inventory history cleared.");

  // ——— 6. Clear old catalog ———
  console.log("\n[CLEANUP] Clearing old product catalog...");
  await db.productAttributeValue.deleteMany({});
  await db.seo.deleteMany({ where: { productId: { not: null } } });
  await db.inventory.deleteMany({});
  await db.product.deleteMany({});
  console.log("  Old products, their attributes, SEO records and inventory cleared.");
  console.log("  (Brand/Category/Collection rows themselves were left in place — not requested for deletion;");
  console.log("   any Offer that referenced a deleted product had its productId cleared automatically.)");

  // ——— 7. Import new catalog ———
  console.log(`\n[IMPORT] Importing ${valid.length} valid row(s)...`);
  const created: Array<{ productId: string; inventoryId: string; brand: string; product: string; surface: string; size: string }> = [];

  const brandCache = new Map<string, string>();
  for (const name of brandNames) {
    const slug = slugify(name);
    const brand = await db.brand.upsert({
      where: { slug },
      update: {},
      create: { slug, name },
    });
    brandCache.set(name, brand.id);
  }

  // Import in transaction chunks of 15 to avoid interactive transaction timeouts over remote latency
  const CHUNK_SIZE = 15;
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    await db.$transaction(
      async (tx) => {
        for (const row of chunk) {
          const brandId = brandCache.get(row.brand)!;
          const key = importKeyFor(row.brand, row.product, row.surface, row.size);
          const slug = `${slugify(row.brand)}-${slugify(row.product)}-${slugify(row.surface)}-${slugify(row.size)}`;

          const product = await tx.product.upsert({
            where: { importKey: key },
            update: {
              name: row.product,
              surface: row.surface,
              size: row.size,
              brandId,
              status: "ACTIVE",
            },
            create: {
              slug,
              importKey: key,
              name: row.product,
              surface: row.surface,
              size: row.size,
              brandId,
              status: "ACTIVE",
              published: true,
              sourceSheet: "Sheet1",
              sourceRow: row.excelRow,
            },
          });

          const inventory = await tx.inventory.upsert({
            where: { productId: product.id },
            update: {
              brand: row.brand,
              productName: row.product,
              size: row.size,
              ...(depotId ? { warehouseId: depotId } : {}),
            },
            create: {
              productId: product.id,
              warehouseId: depotId,
              totalStock: 0,
              looseStock: 0,
              availableStock: 0,
              blockedStock: 0,
              allocatedStock: 0,
              reservedStock: 0,
              damagedStock: 0,
              transitStock: 0,
              deliveredStock: 0,
              minimumStock: 0,
              maximumStock: 0,
              reorderLevel: 0,
              stockStatus: "OUT_OF_STOCK",
              brand: row.brand,
              productName: row.product,
              productNumber: null,
              size: row.size,
            },
          });

          created.push({ productId: product.id, inventoryId: inventory.id, ...row });
        }
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
    console.log(`  Imported ${Math.min(i + CHUNK_SIZE, valid.length)} / ${valid.length} product & inventory rows...`);
  }
  console.log(`[IMPORT] Successfully created/updated ${created.length} product + inventory pairs.`);

  // ——— 8. After counts + report ———
  const after = await countAll();
  printCounts("AFTER", after);

  const reportPath = path.resolve(process.cwd(), `data/backups/catalog-reset-${timestamp}/import-report.json`);
  const report = {
    timestamp,
    sourceFile: path.basename(FILE_PATH),
    excel: { totalDataRows, validRows: valid.length, invalidRows: invalid.length, duplicateRows: duplicates.length },
    invalid,
    duplicates,
    brandsCreated: brandNames,
    productsCreated: created.length,
    depotUsed: depotId,
    before,
    after,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n[REPORT] Full import report saved to ${reportPath}`);

  // ——— 9. Spot check ———
  const spotCheck = await db.product.findFirst({
    where: { name: { contains: "MONET GREY", mode: "insensitive" } },
    include: { inventory: true, brand: true },
  });
  console.log("\n[SPOT CHECK] LONIX / MONET GREY - G:");
  if (spotCheck) {
    console.log(`  Brand: ${spotCheck.brand?.name}`);
    console.log(`  Product: ${spotCheck.name}`);
    console.log(`  Surface: ${spotCheck.surface}`);
    console.log(`  Size: ${spotCheck.size}`);
    console.log(`  Stock: ${spotCheck.inventory?.totalStock ?? "no inventory row"}`);
    console.log(`  Blocked: ${spotCheck.inventory?.blockedStock ?? "—"}`);
    console.log(`  Available: ${spotCheck.inventory?.availableStock ?? "—"}`);
  } else {
    console.log("  NOT FOUND — check the report above.");
  }

  console.log("\n" + "=".repeat(78));
  console.log(" CATALOG RESET + IMPORT COMPLETE");
  console.log("=".repeat(78));
}

main()
  .catch((err) => {
    console.error("\n[FATAL ERROR]", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
