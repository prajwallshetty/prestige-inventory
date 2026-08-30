/**
 * Applies the additive schema changes for the Unique Login Code authentication model.
 *
 * Adds `loginCode` column to the `User` table and creates a unique index on it.
 * Safe and idempotent (`IF NOT EXISTS`). Touches no existing rows or data.
 *
 * Usage: npx tsx scripts/apply-login-code-schema.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const STATEMENTS: Array<{ label: string; sql: string }> = [
  {
    label: "User.loginCode column",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginCode" TEXT`,
  },
  {
    label: "User.loginCode unique index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "User_loginCode_key" ON "User" ("loginCode")`,
  },
];

async function main() {
  console.log(`Applying ${STATEMENTS.length} idempotent schema statement(s)...\n`);
  for (const { label, sql } of STATEMENTS) {
    process.stdout.write(`  ${label} ... `);
    await db.$executeRawUnsafe(sql);
    console.log("ok");
  }
  console.log("\nDone. Run `npx prisma generate` next.");
}

main()
  .catch((e) => {
    console.error("\n[MIGRATION ERROR]", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
