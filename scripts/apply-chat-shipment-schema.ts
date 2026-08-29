/**
 * Applies the additive schema changes for the chat idempotency fix and the
 * dealer-shipment vehicle/driver fields.
 *
 * Raw SQL rather than `prisma db push` — same reason as apply-indexes.ts: the
 * live database carries a legacy `AboutPerson` table absent from
 * schema.prisma, and `db push` wants to drop it. Every statement is
 * `IF NOT EXISTS`, so this is safe to run repeatedly.
 *
 * Run: npx tsx scripts/apply-chat-shipment-schema.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const STATEMENTS: Array<{ label: string; sql: string }> = [
  // ——— Message idempotency (chat spec §7) ———
  {
    label: "Message.client_message_id column",
    sql: `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "client_message_id" TEXT`,
  },
  {
    label: "Message.client_message_id unique index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "Message_client_message_id_key" ON "Message" (client_message_id)`,
  },

  // ——— StockBlock vehicle/driver/transporter fields (shipment spec §24-26) ———
  {
    label: "StockBlock.vehicleNumber column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "vehicleNumber" TEXT`,
  },
  {
    label: "StockBlock.driverName column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "driverName" TEXT`,
  },
  {
    label: "StockBlock.driverPhone column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "driverPhone" TEXT`,
  },
  {
    label: "StockBlock.transporter column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "transporter" TEXT`,
  },
  {
    label: "StockBlock.expectedDeliveryAt column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "expectedDeliveryAt" TIMESTAMP(3)`,
  },
  {
    label: "StockBlock.shippedBy column",
    sql: `ALTER TABLE "StockBlock" ADD COLUMN IF NOT EXISTS "shippedBy" TEXT`,
  },
  {
    label: "StockBlock.vehicleNumber index",
    sql: `CREATE INDEX IF NOT EXISTS "StockBlock_vehicleNumber_idx" ON "StockBlock" ("vehicleNumber")`,
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
