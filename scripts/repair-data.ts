/**
 * Repairs the live data conditions that made the workflow unusable, and
 * reconciles inventory.
 *
 * Findings this addresses (see docs/AUDIT.md):
 *   A2 — `incharge@prestigetiles.com` had no showroom, so its approval queue
 *        was scoped to nothing and came back empty. There was also no
 *        SHOWROOM_STAFF account at all, so Flow A could not be exercised.
 *   B8 — inventory columns can carry drift from earlier code paths; the
 *        reconciliation re-derives them from the blocks that are really active.
 *
 * Idempotent: safe to run repeatedly. Nothing is deleted, and no physical
 * stock figure is ever invented — reconciliation only re-derives the split
 * between available and blocked.
 *
 * Run: npx tsx scripts/repair-data.ts
 */
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { reconcileInventory } from "../src/services/StockBlockService";

async function main() {
  console.log("— Prestige data repair —\n");

  // ——— 1. Every showroom role must have a showroom ———
  const showrooms = await db.showroom.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (showrooms.length === 0) throw new Error("No showrooms exist; cannot assign showroom users.");

  const defaultShowroom = showrooms[0];

  const unscoped = await db.user.findMany({
    where: {
      role: { in: ["SHOWROOM_STAFF", "SHOWROOM_INCHARGE"] },
      showroomId: null,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log(`1. Showroom assignment — ${unscoped.length} user(s) without a showroom.`);
  for (const user of unscoped) {
    await db.user.update({
      where: { id: user.id },
      data: { showroomId: defaultShowroom.id },
    });
    console.log(`   ✓ ${user.email} (${user.role}) → ${defaultShowroom.name}`);
  }

  // ——— 2. A Manager needs a warehouse ———
  const warehouse = await db.warehouse.findFirst({ select: { id: true, name: true } });
  const managersWithoutWarehouse = await db.user.findMany({
    where: { role: "MANAGER", warehouse_id: null },
    select: { id: true, email: true },
  });
  if (warehouse && managersWithoutWarehouse.length > 0) {
    for (const m of managersWithoutWarehouse) {
      await db.user.update({ where: { id: m.id }, data: { warehouse_id: warehouse.id } });
      console.log(`   ✓ ${m.email} (MANAGER) → ${warehouse.name}`);
    }
  }

  // ——— 3. A real SHOWROOM_STAFF account, so Flow A exists ———
  const staffEmail = "showroomstaff@prestigetiles.com";
  const existingStaff = await db.user.findUnique({ where: { email: staffEmail } });

  if (!existingStaff) {
    await db.user.create({
      data: {
        email: staffEmail,
        name: "Showroom Staff",
        password: await hashPassword("prestige123"), // matches scripts/seed-users.ts
        role: "SHOWROOM_STAFF",
        status: "ACTIVE",
        showroomId: defaultShowroom.id,
      },
    });
    console.log(`\n2. Created SHOWROOM_STAFF account ${staffEmail} at ${defaultShowroom.name}.`);
  } else {
    await db.user.update({
      where: { id: existingStaff.id },
      data: { showroomId: existingStaff.showroomId || defaultShowroom.id, role: "SHOWROOM_STAFF" },
    });
    console.log(`\n2. SHOWROOM_STAFF account ${staffEmail} already present.`);
  }

  // ——— 4. Dealers need their human-readable identifier ———
  const dealersWithoutId = await db.dealer.findMany({
    where: { dealerId: null },
    select: { id: true, name: true, dealerCode: true },
  });

  console.log(`\n3. Dealer identifiers — ${dealersWithoutId.length} dealer(s) without one.`);
  const year = new Date().getFullYear();
  for (const dealer of dealersWithoutId) {
    const code = (dealer.dealerCode || "PR1").toUpperCase();
    // The sequence row is the same one the create path uses, so numbers
    // allocated here can never collide with future dealer creation.
    const seq = await db.dealerSequence.upsert({
      where: { year_dealerCode: { year, dealerCode: code } },
      update: { lastNumber: { increment: 1 } },
      create: { year, dealerCode: code, lastNumber: 1 },
    });
    const dealerId = `${year}/${code}/${String(seq.lastNumber).padStart(4, "0")}`;
    await db.dealer.update({
      where: { id: dealer.id },
      data: { dealerId, dealerCode: code },
    });
    console.log(`   ✓ ${dealer.name} → ${dealerId}`);
  }

  // ——— 5. Reconcile inventory against genuinely active blocks ———
  console.log("\n4. Inventory reconciliation…");
  const recon = await reconcileInventory();
  console.log(`   Checked ${recon.checked} inventory rows, repaired ${recon.repaired}.`);
  for (const d of recon.details.slice(0, 10)) {
    console.log(`   • ${d.productId}: blocked ${d.was} → ${d.now}`);
  }

  // ——— Summary ———
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { email: true, role: true, showroomId: true, warehouse_id: true },
    orderBy: { role: "asc" },
  });
  console.log("\n— Active users —");
  for (const u of users) {
    const scope = u.showroomId ? "showroom ✓" : u.warehouse_id ? "warehouse ✓" : "—";
    console.log(`   ${u.role.padEnd(18)} ${u.email.padEnd(38)} ${scope}`);
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Repair failed:", err);
  await db.$disconnect();
  process.exit(1);
});
