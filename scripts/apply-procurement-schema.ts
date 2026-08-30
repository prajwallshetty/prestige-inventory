/**
 * Applies the additive schema changes for the overstock/procurement workflow
 * (spec: allow a block to exceed physical stock and track the shortfall as a
 * procurement requirement against the existing Shipment/ShipmentItem model).
 *
 * Raw SQL rather than `prisma db push` — same reason as apply-indexes.ts and
 * apply-chat-shipment-schema.ts: the live database carries tables absent from
 * schema.prisma, and `db push` wants to drop them. Every statement is
 * `IF NOT EXISTS`, so this is safe to run repeatedly and touches no existing
 * row's data — every new column is nullable or has a zero default, and no
 * column is dropped, renamed or retyped.
 *
 * Run: npx tsx scripts/apply-procurement-schema.ts
 * Then: npx prisma generate
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const STATEMENTS: Array<{ label: string; sql: string }> = [
  // ——— StockBlock: shortage + link to the purchase-order line covering it ———
  {
    label: "StockBlock.shortageQuantity column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "shortageQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  },
  {
    label: "StockBlock.procurementShipmentItemId column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "procurementShipmentItemId" TEXT`,
  },
  {
    label: "StockBlock.procurementShipmentItemId foreign key",
    sql: `DO $$ BEGIN
      ALTER TABLE "StockBlock"
        ADD CONSTRAINT "StockBlock_procurementShipmentItemId_fkey"
        FOREIGN KEY ("procurementShipmentItemId") REFERENCES "ShipmentItem"(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "StockBlock.shortageQuantity index",
    sql: `CREATE INDEX IF NOT EXISTS "StockBlock_shortageQuantity_idx" ON "StockBlock" ("shortageQuantity")`,
  },
  {
    label: "StockBlock.procurementShipmentItemId index",
    sql: `CREATE INDEX IF NOT EXISTS "StockBlock_procurementShipmentItemId_idx" ON "StockBlock" ("procurementShipmentItemId")`,
  },

  // ——— Shipment: supplier purchase reference (spec §19) ———
  {
    label: "Shipment.purchaseReference column",
    sql: `ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "purchaseReference" TEXT`,
  },
  {
    label: "Shipment.createdById column",
    sql: `ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "createdById" TEXT`,
  },
  {
    label: "Shipment.purchaseReference index",
    sql: `CREATE INDEX IF NOT EXISTS "Shipment_purchaseReference_idx" ON "Shipment" ("purchaseReference")`,
  },
];

async function main() {
  console.log(`Applying ${STATEMENTS.length} idempotent schema statement(s)...\n`);
  for (const { label, sql } of STATEMENTS) {
    process.stdout.write(`  ${label} ... `);
    await db.$executeRawUnsafe(sql);
    console.log("ok");
  }
  console.log("\nDone. Run `npx prisma generate` next so the Prisma Client picks up the new fields.");
}

main()
  .catch((e) => {
    console.error("\n[MIGRATION ERROR]", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
