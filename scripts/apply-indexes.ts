/**
 * Applies the indexes the block, inventory, search and notification queries
 * depend on (spec §40).
 *
 * Written as raw SQL rather than `prisma db push` on purpose: the live database
 * carries a legacy `AboutPerson` table that is absent from schema.prisma, and
 * `db push` would drop it. Every statement is `IF NOT EXISTS` and `CONCURRENTLY`
 * where possible, so this is safe to run repeatedly against production.
 *
 * Run: npx tsx scripts/apply-indexes.ts
 */
import { PrismaClient } from "@prisma/client";

// CREATE INDEX CONCURRENTLY cannot run inside a transaction, and Prisma's
// pooled connection wraps statements — the direct URL avoids both problems.
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

/**
 * `ILIKE '%term%'` cannot use a btree index. Trigram GIN indexes are what make
 * the product/dealer/block searches fast at catalogue scale, so the extension
 * comes first.
 */
const STATEMENTS: Array<{ label: string; sql: string }> = [
  { label: "pg_trgm extension", sql: `CREATE EXTENSION IF NOT EXISTS pg_trgm` },

  // ——— Product search (§18, §19, §20) ———
  {
    label: "Product.name trigram",
    sql: `CREATE INDEX IF NOT EXISTS product_name_trgm_idx ON "Product" USING gin (name gin_trgm_ops)`,
  },
  {
    label: "Product.sku trigram",
    sql: `CREATE INDEX IF NOT EXISTS product_sku_trgm_idx ON "Product" USING gin (sku gin_trgm_ops)`,
  },
  {
    label: "Product.productCode trigram",
    sql: `CREATE INDEX IF NOT EXISTS product_code_trgm_idx ON "Product" USING gin ("productCode" gin_trgm_ops)`,
  },
  {
    label: "Product.size trigram",
    sql: `CREATE INDEX IF NOT EXISTS product_size_trgm_idx ON "Product" USING gin (size gin_trgm_ops)`,
  },
  {
    label: "Product.collection trigram",
    sql: `CREATE INDEX IF NOT EXISTS product_collection_trgm_idx ON "Product" USING gin (collection gin_trgm_ops)`,
  },
  {
    label: "Product.status/deletedAt",
    sql: `CREATE INDEX IF NOT EXISTS product_status_deleted_idx ON "Product" (status, "deletedAt")`,
  },
  {
    label: "Product.name sort",
    sql: `CREATE INDEX IF NOT EXISTS product_name_idx ON "Product" (name)`,
  },

  // ——— Blocks (§25, §40) ———
  {
    label: "StockBlock.showroomId",
    sql: `CREATE INDEX IF NOT EXISTS stockblock_showroom_idx ON "StockBlock" ("showroomId")`,
  },
  {
    label: "StockBlock.createdAt",
    sql: `CREATE INDEX IF NOT EXISTS stockblock_created_idx ON "StockBlock" ("createdAt" DESC)`,
  },
  {
    label: "StockBlock.status + createdAt",
    sql: `CREATE INDEX IF NOT EXISTS stockblock_status_created_idx ON "StockBlock" (status, "createdAt" DESC)`,
  },
  {
    label: "StockBlock.showroom + status",
    sql: `CREATE INDEX IF NOT EXISTS stockblock_showroom_status_idx ON "StockBlock" ("showroomId", status)`,
  },
  {
    label: "StockBlock.status + expiresAt (expiry sweep)",
    sql: `CREATE INDEX IF NOT EXISTS stockblock_status_expires_idx ON "StockBlock" (status, "expiresAt")`,
  },
  {
    label: "StockBlock.block_number trigram",
    sql: `CREATE INDEX IF NOT EXISTS stockblock_number_trgm_idx ON "StockBlock" USING gin (block_number gin_trgm_ops)`,
  },

  // ——— Dealers (§18) ———
  {
    label: "Dealer.name trigram",
    sql: `CREATE INDEX IF NOT EXISTS dealer_name_trgm_idx ON "Dealer" USING gin (name gin_trgm_ops)`,
  },
  {
    label: "Dealer.dealerId trigram",
    sql: `CREATE INDEX IF NOT EXISTS dealer_dealerid_trgm_idx ON "Dealer" USING gin ("dealerId" gin_trgm_ops)`,
  },

  // ——— Notifications (§40) ———
  {
    label: "Notification.userId + isRead",
    sql: `CREATE INDEX IF NOT EXISTS notification_user_read_idx ON "Notification" (user_id, is_read)`,
  },
  {
    label: "Notification.userId + createdAt",
    sql: `CREATE INDEX IF NOT EXISTS notification_user_created_idx ON "Notification" (user_id, created_at DESC)`,
  },

  // ——— Movements & audit ———
  {
    label: "InventoryMovement.reference",
    sql: `CREATE INDEX IF NOT EXISTS movement_reference_idx ON "InventoryMovement" ("referenceType", "referenceId")`,
  },
  {
    label: "AuditLog.entity + action",
    sql: `CREATE INDEX IF NOT EXISTS auditlog_entity_action_idx ON "AuditLog" (entity, "entityId", action)`,
  },

  // ——— Users (audience resolution) ———
  {
    label: "User.role + status",
    sql: `CREATE INDEX IF NOT EXISTS user_role_status_idx ON "User" (role, status)`,
  },
  {
    label: "User.showroomId",
    sql: `CREATE INDEX IF NOT EXISTS user_showroom_idx ON "User" ("showroomId")`,
  },
];

async function main() {
  let applied = 0;
  let failed = 0;

  for (const { label, sql } of STATEMENTS) {
    try {
      await db.$executeRawUnsafe(sql);
      console.log(`  ✓ ${label}`);
      applied++;
    } catch (err: any) {
      console.error(`  ✗ ${label}: ${err.message.split("\n")[0]}`);
      failed++;
    }
  }

  console.log(`\n${applied} statement(s) applied, ${failed} failed.`);
  await db.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
