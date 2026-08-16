/**
 * Prestige Tiles master product + opening inventory importer.
 *
 * Reads a flat JSON export (one row per SKU/variant) and upserts it into the
 * existing Product/Brand/Category/Collection/Inventory schema. Idempotent:
 * rerunning with the same or a refreshed file never duplicates catalogue
 * rows or clobbers live inventory.
 *
 * Usage:
 *   npm run seed:prestige                       # real import, OPENING_INVENTORY mode
 *   npm run seed:prestige -- --dry-run           # preview only, no writes
 *   npm run seed:prestige -- --mode=MASTER_ONLY  # catalogue fields only, never touches Inventory
 *   npm run seed:prestige -- --file=data/prestige-products-2026-09.json
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "../src/lib/db";
import { invalidateCache } from "../src/lib/redis";

// ————— CLI args —————

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MODE = (args.find((a) => a.startsWith("--mode="))?.split("=")[1] || "OPENING_INVENTORY") as
  | "MASTER_ONLY"
  | "OPENING_INVENTORY";
const FILE_ARG = args.find((a) => a.startsWith("--file="))?.split("=")[1];
const FILE_PATH = path.resolve(process.cwd(), FILE_ARG || "data/prestige-products.json");

if (MODE !== "MASTER_ONLY" && MODE !== "OPENING_INVENTORY") {
  console.error(`Invalid --mode "${MODE}". Expected MASTER_ONLY or OPENING_INVENTORY.`);
  process.exit(1);
}

// Columns present in the source export that carry no usable per-row data
// (leftover header/tab-name debris from the original spreadsheet export).
const IGNORED_SOURCE_COLUMNS = ["Unnamed: 29", "Sanitaryware / bathroom"];

// ————— Types —————

interface RawRow {
  "Source Sheet": string | null;
  "Source Row": number | null;
  "Import Key": string | null;
  Category: string | null;
  Brand: string | null;
  "Collection / Series": string | null;
  "Product Number / SKU": string | null;
  "Product Name": string | null;
  Size: string | null;
  "Finish / Variant": string | null;
  Unit: string | null;
  "Physical Stock (Boxes)": number | null;
  "Loose Stock (Pieces)": number | null;
  "Blocked Stock (Boxes)": number | null;
  "Confirmed Stock (Boxes)": number | null;
  "Delivered Stock (Boxes)": number | null;
  "Damaged Stock (Boxes)": number | null;
  "In Transit Stock (Boxes)": number | null;
  "Reorder Level (Boxes)": number | null;
  Warehouse: string | null;
  "S3 Image Key": string | null;
  "Image URL": string | null;
  "Website Visible": string | null;
  Active: string | null;
  Remarks: string | null;
  [key: string]: unknown;
}

interface ErrorRow {
  row: number | string;
  productNumber: string;
  productName: string;
  issue: string;
  severity: "ERROR" | "WARNING";
  suggestedFix: string;
}

// ————— Helpers —————

function slugify(input: string | null | undefined, fallback = "item"): string {
  const s = (input || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || fallback;
}

// Title-cases plain alphabetic words but leaves anything with a digit or
// special character alone, e.g. "ALL IN ONE SINK BLACK" -> "All In One Sink
// Black", while "P|4.6" and "60X250" stay untouched.
function titleCaseName(s: string): string {
  return s
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s*$/.test(tok)) return tok;
      if (!/^[A-Za-z]+(-[A-Za-z]+)*$/.test(tok)) return tok;
      return tok
        .split("-")
        .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
        .join("-");
    })
    .join("");
}

function num(v: unknown): { value: number; wasInvalid: boolean } {
  if (v === null || v === undefined || v === "") return { value: 0, wasInvalid: false };
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return { value: 0, wasInvalid: true };
  if (n < 0) return { value: 0, wasInvalid: true };
  return { value: n, wasInvalid: false };
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ————— Normalized row —————

interface Normalized {
  importKey: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  categoryName: string;
  brandName: string | null;
  collectionName: string | null;
  name: string;
  size: string | null;
  finish: string | null;
  unit: string | null;
  websiteVisible: boolean;
  active: boolean;
  imageKey: string | null;
  imageUrl: string | null;
  physicalStock: number;
  looseStock: number;
  blockedStock: number;
  confirmedStock: number;
  deliveredStock: number;
  damagedStock: number;
  transitStock: number;
  reorderLevel: number;
  warehouseName: string | null;
}

function normalizeRow(row: RawRow, index: number): { data: Normalized | null; issues: ErrorRow[] } {
  const issues: ErrorRow[] = [];
  const rowLabel = row["Source Row"] ?? index + 1;
  const productNumber = str(row["Import Key"]) || "";
  const productNameRaw = str(row["Product Name"]) || "";

  const importKey = str(row["Import Key"]);
  if (!importKey) {
    issues.push({
      row: rowLabel,
      productNumber: productNumber || "(missing)",
      productName: productNameRaw || "(missing)",
      issue: "Missing Import Key — cannot establish a stable identity for this row.",
      severity: "ERROR",
      suggestedFix: "Add a unique Import Key to the source row and re-import.",
    });
    return { data: null, issues };
  }

  const categoryName = str(row["Category"]) || "Other";
  if (!row["Category"]) {
    issues.push({
      row: rowLabel,
      productNumber: importKey,
      productName: productNameRaw || "(missing)",
      issue: "Missing Category — defaulted to \"Other\".",
      severity: "WARNING",
      suggestedFix: "Set an explicit category in the source sheet.",
    });
  }

  let name = titleCaseName(productNameRaw || importKey);
  const collectionName = str(row["Collection / Series"]);
  if (!productNameRaw) {
    issues.push({
      row: rowLabel,
      productNumber: importKey,
      productName: "(missing)",
      issue: "Missing Product Name — fell back to Import Key.",
      severity: "WARNING",
      suggestedFix: "Provide a descriptive product name in the source sheet.",
    });
  } else if (collectionName && !productNameRaw.toUpperCase().includes(collectionName.toUpperCase())) {
    name = titleCaseName(`${collectionName} ${productNameRaw}`);
  }

  const physical = num(row["Physical Stock (Boxes)"]);
  const loose = num(row["Loose Stock (Pieces)"]);
  const blocked = num(row["Blocked Stock (Boxes)"]);
  const confirmed = num(row["Confirmed Stock (Boxes)"]);
  const delivered = num(row["Delivered Stock (Boxes)"]);
  const damaged = num(row["Damaged Stock (Boxes)"]);
  const transit = num(row["In Transit Stock (Boxes)"]);
  const reorder = num(row["Reorder Level (Boxes)"]);

  for (const [label, n] of [
    ["Physical Stock", physical],
    ["Loose Stock", loose],
    ["Blocked Stock", blocked],
    ["Confirmed Stock", confirmed],
    ["Delivered Stock", delivered],
    ["Damaged Stock", damaged],
    ["In Transit Stock", transit],
    ["Reorder Level", reorder],
  ] as const) {
    if (n.wasInvalid) {
      issues.push({
        row: rowLabel,
        productNumber: importKey,
        productName: name,
        issue: `${label} was negative or non-numeric — clamped to 0.`,
        severity: "WARNING",
        suggestedFix: "Fix the source value; negative stock is not supported.",
      });
    }
  }

  if (physical.value > 10000) {
    issues.push({
      row: rowLabel,
      productNumber: importKey,
      productName: name,
      issue: `Physical Stock of ${physical.value} boxes is unusually large — verify this isn't a data entry error.`,
      severity: "WARNING",
      suggestedFix: "Confirm the true opening box count against the physical warehouse count.",
    });
  }

  return {
    data: {
      importKey,
      sourceSheet: str(row["Source Sheet"]),
      sourceRow: typeof row["Source Row"] === "number" ? row["Source Row"] : null,
      categoryName,
      brandName: str(row["Brand"]),
      collectionName,
      name,
      size: str(row["Size"]),
      finish: str(row["Finish / Variant"]),
      unit: str(row["Unit"]),
      websiteVisible: str(row["Website Visible"])?.toLowerCase() !== "no",
      active: str(row["Active"])?.toLowerCase() !== "no",
      imageKey: str(row["S3 Image Key"]),
      imageUrl: str(row["Image URL"]),
      physicalStock: physical.value,
      looseStock: loose.value,
      blockedStock: blocked.value,
      confirmedStock: confirmed.value,
      deliveredStock: delivered.value,
      damagedStock: damaged.value,
      transitStock: transit.value,
      reorderLevel: reorder.value,
      warehouseName: str(row["Warehouse"]),
    },
    issues,
  };
}

function computeStockStatus(inv: {
  availableStock: number;
  transitStock: number;
  reorderLevel: number;
}): string {
  if (inv.availableStock <= 0) return inv.transitStock > 0 ? "INCOMING" : "OUT_OF_STOCK";
  if (inv.reorderLevel > 0 && inv.availableStock <= inv.reorderLevel) return "LOW_STOCK";
  return "AVAILABLE";
}

// ————— Main —————

async function main() {
  const startedAt = Date.now();

  console.log("========================================");
  console.log("PRESTIGE TILES IMPORT");
  console.log("========================================");
  console.log(`Source file : ${FILE_PATH}`);
  console.log(`Mode        : ${MODE}`);
  console.log(`Dry run     : ${DRY_RUN ? "YES (no database writes)" : "NO"}`);
  console.log("");

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(FILE_PATH, "utf8");
  const fileHash = crypto.createHash("sha256").update(raw).digest("hex");
  const rows: RawRow[] = JSON.parse(raw);

  console.log(`Total rows  : ${rows.length}`);
  console.log(`Ignored columns (no usable data): ${IGNORED_SOURCE_COLUMNS.join(", ")}`);
  console.log("");

  // — Resolve/seed the warehouse this import targets —
  let warehouse = await db.warehouse.findFirst({ where: { code: "MAIN-DEPOT" } });
  if (!warehouse && !DRY_RUN) {
    warehouse = await db.warehouse.create({
      data: { name: "Main Depot", code: "MAIN-DEPOT", location: "Main Depot", status: "ACTIVE" },
    });
  }

  // — Batch record —
  let batch: { id: string } | null = null;
  if (!DRY_RUN) {
    batch = await db.productImportBatch.create({
      data: {
        fileName: path.basename(FILE_PATH),
        fileHash,
        mode: MODE,
        dryRun: false,
        status: "RUNNING",
        totalRows: rows.length,
        createdBy: "seed:prestige",
      },
    });
  }

  // — Caches for Brand/Category/Collection, seeded from the DB and grown as new slugs appear —
  const brandCache = new Map<string, string>(); // slug -> id
  const categoryCache = new Map<string, string>();
  const collectionCache = new Map<string, string>();

  for (const b of await db.brand.findMany({ select: { id: true, slug: true } })) brandCache.set(b.slug, b.id);
  for (const c of await db.category.findMany({ select: { id: true, slug: true } })) categoryCache.set(c.slug, c.id);
  for (const c of await db.collection.findMany({ select: { id: true, slug: true } })) collectionCache.set(c.slug, c.id);

  // Preload existing products/inventory in bulk so the per-row loop below never
  // issues a read round-trip — with 1,000+ rows against a pooled remote DB,
  // one findUnique per row (2 reads + a write, sequentially) is the difference
  // between seconds and tens of minutes.
  console.log("Preloading existing products/inventory...");
  const existingProductsByImportKey = new Map<string, string>(); // importKey -> id
  for (const p of await db.product.findMany({
    where: { importKey: { not: null } },
    select: { id: true, importKey: true },
  })) {
    if (p.importKey) existingProductsByImportKey.set(p.importKey, p.id);
  }
  const productIdsWithInventory = new Set<string>();
  for (const inv of await db.inventory.findMany({ select: { productId: true } })) {
    productIdsWithInventory.add(inv.productId);
  }
  console.log(
    `Preloaded ${existingProductsByImportKey.size} existing products, ${productIdsWithInventory.size} with inventory.`
  );
  console.log("");

  const brandsWouldCreate = new Set<string>();
  const categoriesWouldCreate = new Set<string>();
  const collectionsWouldCreate = new Set<string>();

  // Resolve every distinct Brand/Category/Collection up front, sequentially,
  // *before* the concurrent product loop below. Two rows in the same
  // concurrency batch could otherwise both miss the cache for the same new
  // slug and race to create it — doing this pass first means the batch loop
  // only ever hits the cache (pure, race-free reads).
  async function resolveBrandId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const slug = slugify(name, "brand");
    if (brandCache.has(slug)) return brandCache.get(slug)!;
    if (DRY_RUN) {
      brandsWouldCreate.add(slug);
      return null;
    }
    const brand = await db.brand.upsert({
      where: { slug },
      update: {},
      create: { slug, name: name.trim() },
    });
    brandCache.set(slug, brand.id);
    return brand.id;
  }

  async function resolveCategoryId(name: string): Promise<string | null> {
    const slug = slugify(name, "other");
    if (categoryCache.has(slug)) return categoryCache.get(slug)!;
    if (DRY_RUN) {
      categoriesWouldCreate.add(slug);
      return null;
    }
    const category = await db.category.upsert({
      where: { slug },
      update: {},
      create: { slug, name: name.trim() },
    });
    categoryCache.set(slug, category.id);
    return category.id;
  }

  async function resolveCollectionId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const slug = slugify(name, "collection");
    if (collectionCache.has(slug)) return collectionCache.get(slug)!;
    if (DRY_RUN) {
      collectionsWouldCreate.add(slug);
      return null;
    }
    const collection = await db.collection.upsert({
      where: { slug },
      update: {},
      create: { slug, name: name.trim() },
    });
    collectionCache.set(slug, collection.id);
    return collection.id;
  }

  // Pre-resolve every distinct Brand/Category/Collection sequentially (small
  // set — a few dozen at most — so this is fast even one at a time).
  if (!DRY_RUN) {
    const normalizedAll = rows.map((r, i) => normalizeRow(r, i).data).filter((d): d is Normalized => !!d);
    const distinctBrands = new Set(normalizedAll.map((d) => d.brandName).filter((x): x is string => !!x));
    const distinctCategories = new Set(normalizedAll.map((d) => d.categoryName));
    const distinctCollections = new Set(normalizedAll.map((d) => d.collectionName).filter((x): x is string => !!x));
    for (const b of distinctBrands) await resolveBrandId(b);
    for (const c of distinctCategories) await resolveCategoryId(c);
    for (const c of distinctCollections) await resolveCollectionId(c);
    console.log(
      `Resolved ${distinctBrands.size} brands, ${distinctCategories.size} categories, ${distinctCollections.size} collections.`
    );
    console.log("");
  }

  // — Stats —
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let warningRows = 0;
  let failedRows = 0;
  let inventoryCreated = 0;
  let inventoryPreserved = 0;
  let missingImages = 0;
  const allIssues: ErrorRow[] = [];

  async function processRow(row: RawRow, i: number): Promise<void> {
    const { data, issues } = normalizeRow(row, i);
    if (issues.length) allIssues.push(...issues);

    if (!data) {
      failedRows++;
      return;
    }
    if (issues.some((x) => x.severity === "WARNING")) warningRows++;
    if (!data.imageKey && !data.imageUrl) missingImages++;

    try {
      const brandId = await resolveBrandId(data.brandName);
      const categoryId = await resolveCategoryId(data.categoryName);
      const collectionId = await resolveCollectionId(data.collectionName);

      const existingId = existingProductsByImportKey.get(data.importKey);

      if (DRY_RUN) {
        if (existingId) updatedRows++;
        else createdRows++;
        return;
      }

      const status = data.active ? "ACTIVE" : "ARCHIVED";
      let productId: string;

      if (existingId) {
        const updated = await db.product.update({
          where: { id: existingId },
          data: {
            name: data.name,
            collection: data.collectionName,
            collectionId,
            size: data.size,
            finish: data.finish,
            unit: data.unit,
            categoryId,
            brandId,
            published: data.websiteVisible,
            status,
            sourceSheet: data.sourceSheet,
            sourceRow: data.sourceRow,
            sourceImportId: batch!.id,
          },
        });
        productId = updated.id;
        updatedRows++;
      } else {
        const slug = `${slugify(data.name, "product")}-${data.importKey.toLowerCase()}`;
        const created = await db.product.create({
          data: {
            importKey: data.importKey,
            sourceSheet: data.sourceSheet,
            sourceRow: data.sourceRow,
            sourceImportId: batch!.id,
            slug,
            name: data.name,
            collection: data.collectionName,
            collectionId,
            size: data.size,
            finish: data.finish,
            unit: data.unit,
            categoryId,
            brandId,
            image_key: data.imageKey,
            published: data.websiteVisible,
            status,
          },
        });
        productId = created.id;
        createdRows++;
      }

      // — Inventory (SAFE MODE: never overwrite existing live inventory) —
      if (MODE === "OPENING_INVENTORY") {
        if (!productIdsWithInventory.has(productId)) {
          productIdsWithInventory.add(productId); // reserve immediately, before awaits, so concurrent rows never double-create
          const availableStock = Math.max(
            0,
            data.physicalStock - data.blockedStock - data.confirmedStock - data.damagedStock
          );
          const stockStatus = computeStockStatus({
            availableStock,
            transitStock: data.transitStock,
            reorderLevel: data.reorderLevel,
          });

          const inv = await db.inventory.create({
            data: {
              productId,
              warehouseId: warehouse?.id ?? null,
              totalStock: data.physicalStock,
              looseStock: data.looseStock,
              availableStock,
              blockedStock: data.blockedStock,
              allocatedStock: data.confirmedStock, // "Confirmed" lives inside allocatedStock per app convention
              damagedStock: data.damagedStock,
              transitStock: data.transitStock,
              deliveredStock: data.deliveredStock,
              reorderLevel: data.reorderLevel,
              stockStatus,
            },
          });

          await db.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              productId,
              warehouseId: warehouse?.id ?? null,
              movementType: "OPENING_BALANCE",
              quantity: data.physicalStock,
              previousQuantity: 0,
              newQuantity: data.physicalStock,
              referenceType: "IMPORT",
              referenceId: batch!.id,
              reason: "Prestige Tiles Master Inventory Import — opening balance",
              performedBy: "SYSTEM_IMPORT",
            },
          });
          inventoryCreated++;
        } else {
          inventoryPreserved++;
        }
      }
    } catch (err: any) {
      failedRows++;
      allIssues.push({
        row: data.sourceRow ?? i + 1,
        productNumber: data.importKey,
        productName: data.name,
        issue: `Database error: ${err.message}`,
        severity: "ERROR",
        suggestedFix: "Inspect the row manually and re-run the import.",
      });
    }
  }

  // Process in bounded-concurrency batches — sequential per row was 1-3
  // network round-trips × 1,124 rows against a remote pooled DB (multi-hour).
  // Chunks of CONCURRENCY keep the connection pool from being overwhelmed
  // while still cutting wall-clock time by roughly the batch size.
  // Real runs stay under Prisma's default pooled connection limit (10 here,
  // per the "Timed out fetching a new connection" error surfaced at 20) so
  // rows never race each other out of a connection mid-write.
  const CONCURRENCY = DRY_RUN ? 50 : 8;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((row, j) => processRow(row, i + j)));
    if ((i + CONCURRENCY) % 100 < CONCURRENCY) {
      console.log(`  ...${Math.min(i + CONCURRENCY, rows.length)}/${rows.length} rows processed`);
    }
  }

  skippedRows = failedRows; // rows that never produced a product record

  const durationMs = Date.now() - startedAt;

  // — Reports —
  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: FILE_PATH,
    fileHash,
    mode: MODE,
    dryRun: DRY_RUN,
    totalRecords: rows.length,
    created: DRY_RUN ? undefined : createdRows,
    updated: DRY_RUN ? undefined : updatedRows,
    wouldCreate: DRY_RUN ? createdRows : undefined,
    wouldUpdate: DRY_RUN ? updatedRows : undefined,
    skipped: skippedRows,
    warnings: warningRows,
    errors: failedRows,
    brandsCreated: DRY_RUN ? undefined : undefined,
    brandsWouldCreate: DRY_RUN ? [...brandsWouldCreate] : undefined,
    categoriesWouldCreate: DRY_RUN ? [...categoriesWouldCreate] : undefined,
    collectionsWouldCreate: DRY_RUN ? [...collectionsWouldCreate] : undefined,
    inventoryCreated: DRY_RUN ? undefined : inventoryCreated,
    inventoryPreserved: DRY_RUN ? undefined : inventoryPreserved,
    missingImages,
    ignoredSourceColumns: IGNORED_SOURCE_COLUMNS,
    issues: allIssues,
    durationMs,
  };

  if (!DRY_RUN) {
    await db.productImportBatch.update({
      where: { id: batch!.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        createdRows,
        updatedRows,
        skippedRows,
        warningRows,
        failedRows,
        inventoryCreated,
        errorReport: allIssues.length ? (allIssues as any) : undefined,
      },
    });

    await invalidateCache("inventory:*");
    await invalidateCache("dashboard:*");

    fs.writeFileSync(
      path.resolve(process.cwd(), "prestige-import-report.json"),
      JSON.stringify(report, null, 2)
    );

    if (allIssues.length) {
      const csvLines = [
        "Row,Product Number,Product Name,Issue,Severity,Suggested Fix",
        ...allIssues.map((e) =>
          [e.row, e.productNumber, e.productName, e.issue, e.severity, e.suggestedFix].map(csvEscape).join(",")
        ),
      ];
      fs.writeFileSync(
        path.resolve(process.cwd(), "prestige-import-errors.csv"),
        csvLines.join("\n")
      );
    }
  }

  // — Console summary —
  console.log("========================================");
  console.log(DRY_RUN ? "PRESTIGE IMPORT PREVIEW" : "PRESTIGE TILES IMPORT COMPLETE");
  console.log("========================================");
  console.log(`Total Records     : ${rows.length}`);
  if (DRY_RUN) {
    console.log(`New Products      : ${createdRows}`);
    console.log(`Existing Products : ${updatedRows}`);
    console.log(`New Brands        : ${brandsWouldCreate.size}`);
    console.log(`New Categories    : ${categoriesWouldCreate.size}`);
    console.log(`New Collections   : ${collectionsWouldCreate.size}`);
  } else {
    console.log(`Created           : ${createdRows}`);
    console.log(`Updated           : ${updatedRows}`);
    console.log(`Inventory Created : ${inventoryCreated}`);
    console.log(`Inventory Preserved (already existed): ${inventoryPreserved}`);
  }
  console.log(`Skipped           : ${skippedRows}`);
  console.log(`Warnings          : ${warningRows}`);
  console.log(`Errors            : ${failedRows}`);
  console.log(`Missing Images    : ${missingImages}`);
  console.log(`Duration          : ${(durationMs / 1000).toFixed(2)}s`);
  console.log("========================================");
  if (DRY_RUN) {
    console.log("No database changes made.");
  } else {
    console.log(`Report written to prestige-import-report.json`);
    if (allIssues.length) console.log(`Issues written to prestige-import-errors.csv`);
  }
}

main()
  .catch((e) => {
    console.error("[IMPORT EXCEPTION]:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
