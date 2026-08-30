/**
 * Applies the additive schema changes for multi-product blocking (one order,
 * many product/quantity lines). Same idempotent raw-SQL pattern as
 * apply-procurement-schema.ts / apply-chat-shipment-schema.ts — every
 * statement is `IF NOT EXISTS`, so this is safe to run repeatedly and
 * touches no existing row's data. No column is dropped, renamed or
 * retyped, and every existing StockBlock row is untouched (its new
 * `blockOrderId` column defaults to NULL, meaning "not part of a
 * multi-product order" — exactly what a historical single-product block is).
 *
 * Run: npx tsx scripts/apply-multi-product-schema.ts
 * Then: npx prisma generate
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const STATEMENTS: Array<{ label: string; sql: string }> = [
  {
    label: "BlockOrder table",
    sql: `CREATE TABLE IF NOT EXISTS "BlockOrder" (
      "id" TEXT NOT NULL,
      "orderNumber" TEXT NOT NULL,
      "dealerId" TEXT,
      "showroomId" TEXT,
      "warehouseId" TEXT,
      "requestedBy" TEXT NOT NULL,
      "createdById" TEXT,
      "createdRole" TEXT,
      "approvalRoute" TEXT NOT NULL DEFAULT 'DIRECT',
      "remarks" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3),
      CONSTRAINT "BlockOrder_pkey" PRIMARY KEY ("id")
    )`,
  },
  {
    label: "BlockOrder.orderNumber unique index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "BlockOrder_orderNumber_key" ON "BlockOrder" ("orderNumber")`,
  },
  { label: "BlockOrder.showroomId index", sql: `CREATE INDEX IF NOT EXISTS "BlockOrder_showroomId_idx" ON "BlockOrder" ("showroomId")` },
  { label: "BlockOrder.dealerId index", sql: `CREATE INDEX IF NOT EXISTS "BlockOrder_dealerId_idx" ON "BlockOrder" ("dealerId")` },
  { label: "BlockOrder.warehouseId index", sql: `CREATE INDEX IF NOT EXISTS "BlockOrder_warehouseId_idx" ON "BlockOrder" ("warehouseId")` },
  { label: "BlockOrder.createdById index", sql: `CREATE INDEX IF NOT EXISTS "BlockOrder_createdById_idx" ON "BlockOrder" ("createdById")` },
  { label: "BlockOrder.createdAt index", sql: `CREATE INDEX IF NOT EXISTS "BlockOrder_createdAt_idx" ON "BlockOrder" ("createdAt")` },
  {
    label: "BlockOrder.dealerId foreign key",
    sql: `DO $$ BEGIN
      ALTER TABLE "BlockOrder" ADD CONSTRAINT "BlockOrder_dealerId_fkey"
        FOREIGN KEY ("dealerId") REFERENCES "Dealer"(id) ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "BlockOrder.showroomId foreign key",
    sql: `DO $$ BEGIN
      ALTER TABLE "BlockOrder" ADD CONSTRAINT "BlockOrder_showroomId_fkey"
        FOREIGN KEY ("showroomId") REFERENCES "Showroom"(id) ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "BlockOrder.warehouseId foreign key",
    sql: `DO $$ BEGIN
      ALTER TABLE "BlockOrder" ADD CONSTRAINT "BlockOrder_warehouseId_fkey"
        FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"(id) ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },

  // ——— StockBlock: link to the order it's a line of, if any ———
  {
    label: "StockBlock.blockOrderId column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "blockOrderId" TEXT`,
  },
  {
    label: "StockBlock.blockOrderId foreign key",
    sql: `DO $$ BEGIN
      ALTER TABLE "StockBlock" ADD CONSTRAINT "StockBlock_blockOrderId_fkey"
        FOREIGN KEY ("blockOrderId") REFERENCES "BlockOrder"(id) ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "StockBlock.blockOrderId index",
    sql: `CREATE INDEX IF NOT EXISTS "StockBlock_blockOrderId_idx" ON "StockBlock" ("blockOrderId")`,
  },
];

async function main() {
  console.log(`Applying ${STATEMENTS.length} idempotent schema statement(s)...\n`);
  for (const { label, sql } of STATEMENTS) {
    process.stdout.write(`  ${label} ... `);
    await db.$executeRawUnsafe(sql);
    console.log("ok");
  }
  console.log("\nDone. Run `npx prisma generate` next so the Prisma Client picks up the new model/field.");
}

main()
  .catch((e) => {
    console.error("\n[MIGRATION ERROR]", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
