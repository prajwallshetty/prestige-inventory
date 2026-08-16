/**
 * Copies this application's data from one PostgreSQL database to another.
 *
 * Written for the Neon region move (us-east-2 → ap-south-1). Round-trip
 * latency to the current database is ~1.5s from India, which dominates every
 * page render; relocating the database is worth more than any query-level
 * optimisation in this repo.
 *
 * Uses Prisma rather than pg_dump so it runs anywhere Node runs (pg_dump is
 * not installed on this machine) and so rows are copied in foreign-key-safe
 * order. `createMany` with `skipDuplicates` makes the whole run idempotent —
 * an interrupted migration can simply be re-run.
 *
 * Usage:
 *   1. Create the new Neon project in the target region, then put its pooled
 *      connection string in .env as TARGET_DATABASE_URL.
 *   2. Push the schema to it:
 *        npx prisma db push --url "$TARGET_DATABASE_URL"
 *      (or temporarily point DATABASE_URL at the target and run prisma db push)
 *   3. Dry run, then migrate:
 *        npm run migrate:db -- --dry-run
 *        npm run migrate:db
 *   4. Verify, then swap DATABASE_URL/DIRECT_URL over to the new project.
 *
 * The source database is only ever READ from. Nothing is dropped or modified
 * on either side beyond inserting rows into the (expected empty) target.
 */
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const BATCH = 200;

const SOURCE_URL = process.env.DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;

if (!SOURCE_URL) {
  console.error("DATABASE_URL is not set (source).");
  process.exit(1);
}
if (!TARGET_URL && !DRY_RUN) {
  console.error("TARGET_DATABASE_URL is not set. Add the new database's connection string to .env.");
  process.exit(1);
}
if (TARGET_URL && TARGET_URL === SOURCE_URL) {
  console.error("TARGET_DATABASE_URL is identical to DATABASE_URL — refusing to run.");
  process.exit(1);
}

/**
 * Copy order matters: parents before children, so foreign keys always resolve.
 * Models with self-references (Category.parentId, MediaFolder.parentId) are
 * copied in one pass because the rows carry their own ids — Postgres FK checks
 * are satisfied as long as the parent row lands in the same createMany batch or
 * an earlier one, which holds here given the small, shallow trees involved.
 */
const COPY_ORDER = [
  "warehouse",
  "dealer",
  "showroom",
  "user",
  "category",
  "brand",
  "collection",
  "productImportBatch",
  "product",
  "inventory",
  "inventoryMovement",
  "inventoryBlock",
  "inventoryHistory",
  "stockBlock",
  "stockBooking",
  "stockBookingItem",
  "shipment",
  "shipmentItem",
  "mediaFolder",
  "media",
  "lead",
  "leadNote",
  "booking",
  "post",
  "project",
  "galleryAlbum",
  "galleryItem",
  "video",
  "testimonial",
  "faq",
  "offer",
  "landingPage",
  "googlePost",
  "conversation",
  "seo",
  "redirect",
  "setting",
  "subscriber",
  "announcement",
  "announcementRecipient",
  "notification",
  "auditLog",
  "whatsAppAnalytics",
  "catalogImport",
  "extractedProduct",
  "importAsset",
] as const;

async function main() {
  const started = Date.now();
  const source = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
  const target = TARGET_URL
    ? new PrismaClient({ datasources: { db: { url: TARGET_URL } } })
    : null;

  const host = (u: string) => {
    try { return new URL(u).host; } catch { return "(unparseable)"; }
  };

  console.log("========================================");
  console.log("DATABASE MIGRATION");
  console.log("========================================");
  console.log(`Source : ${host(SOURCE_URL!)}`);
  console.log(`Target : ${TARGET_URL ? host(TARGET_URL) : "(dry run — none)"}`);
  console.log(`Mode   : ${DRY_RUN ? "DRY RUN (reads source only)" : "LIVE COPY"}`);
  console.log("");

  const summary: Array<{ model: string; source: number; copied: number; targetAfter: number | null }> = [];

  for (const model of COPY_ORDER) {
    const src = (source as any)[model];
    if (!src?.count) continue; // model not in this schema version

    let sourceCount = 0;
    try {
      sourceCount = await src.count();
    } catch {
      continue;
    }
    if (sourceCount === 0) continue;

    if (DRY_RUN) {
      console.log(`${model.padEnd(24)} ${String(sourceCount).padStart(6)} rows would be copied`);
      summary.push({ model, source: sourceCount, copied: 0, targetAfter: null });
      continue;
    }

    const dst = (target as any)[model];
    let copied = 0;
    for (let skip = 0; skip < sourceCount; skip += BATCH) {
      const rows = await src.findMany({ skip, take: BATCH });
      if (!rows.length) break;
      const res = await dst.createMany({ data: rows, skipDuplicates: true });
      copied += res.count;
    }
    const targetAfter = await dst.count();
    console.log(
      `${model.padEnd(24)} source=${String(sourceCount).padStart(6)}  inserted=${String(copied).padStart(6)}  target=${String(targetAfter).padStart(6)}` +
        (targetAfter === sourceCount ? "  OK" : "  ** MISMATCH **")
    );
    summary.push({ model, source: sourceCount, copied, targetAfter });
  }

  console.log("");
  console.log("========================================");
  if (DRY_RUN) {
    console.log("DRY RUN COMPLETE — no data written.");
    console.log(`Models with data: ${summary.length}`);
    console.log(`Total rows to copy: ${summary.reduce((n, s) => n + s.source, 0)}`);
  } else {
    const mismatches = summary.filter((s) => s.targetAfter !== s.source);
    console.log("MIGRATION COMPLETE");
    console.log(`Models copied     : ${summary.length}`);
    console.log(`Total source rows : ${summary.reduce((n, s) => n + s.source, 0)}`);
    console.log(`Total target rows : ${summary.reduce((n, s) => n + (s.targetAfter || 0), 0)}`);
    if (mismatches.length) {
      console.log("");
      console.log("ROW COUNT MISMATCHES — investigate before switching over:");
      mismatches.forEach((m) => console.log(`  ${m.model}: source=${m.source} target=${m.targetAfter}`));
    } else {
      console.log("All row counts match. Safe to switch DATABASE_URL after a manual spot check.");
    }
  }
  console.log(`Duration: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("========================================");

  await source.$disconnect();
  await target?.$disconnect();
}

main().catch(async (e) => {
  console.error("[MIGRATION FAILED]", e);
  process.exit(1);
});
