/**
 * Additive Migration Script: Assigns unique Login Codes to all existing users.
 *
 * Guaranteed non-destructive:
 * - Touches NO password, email, role, or user status.
 * - Only sets `loginCode` for users where `loginCode` is currently null.
 * - Guarantees 100% database-level uniqueness.
 *
 * Usage: npx tsx scripts/assign-login-codes.ts
 */
import { db } from "../src/lib/db";
import { generateUniqueLoginCode } from "../src/lib/loginCode";

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  ASSIGNING UNIQUE LOGIN CODES TO EXISTING USERS");
  console.log("════════════════════════════════════════════════════════════\n");

  const usersWithoutCode = await db.user.findMany({
    where: { loginCode: null },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${usersWithoutCode.length} user(s) requiring login codes.\n`);

  for (const user of usersWithoutCode) {
    const code = await generateUniqueLoginCode(user.role, user.showroomId);
    await db.user.update({
      where: { id: user.id },
      data: { loginCode: code },
    });
    console.log(`  ✓ User: ${user.name} (${user.email}) | Role: ${user.role} -> Code: ${code}`);
  }

  console.log("\n  All active and existing users now have unique login codes.");
  console.log("════════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error("\n[MIGRATION ERROR]", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
