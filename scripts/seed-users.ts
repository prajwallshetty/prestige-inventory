import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("[SEED] Seeding B2B portal users...");

  // Find a dealer, warehouse, and showroom to link users to
  const dealer = await db.dealer.findFirst();
  const warehouse = await db.warehouse.findFirst();
  let showroom = await db.showroom.findFirst();

  if (!dealer || !warehouse) {
    console.error("Please seed dealers and warehouses first!");
    return;
  }

  if (!showroom) {
    console.log("Creating default showroom Indiranagar...");
    showroom = await db.showroom.create({
      data: {
        slug: "indiranagar-showroom",
        name: "Indiranagar Prestige Experience Center",
        subtitle: "Flagship Prestige Showroom",
        addressLine: "542, 12th Main Rd, Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560038",
        phone: "+91 99999 88888",
        hoursWeekdays: "Monday–Saturday: 9:00 AM – 8:00 PM",
        hoursSunday: "Sunday: 11:00 AM – 5:00 PM",
        isFlagship: true,
      },
    });
  }

  const hashedPassword = await bcrypt.hash("prestige123", 10);

  // 1. Super Admin
  const adminUser = await db.user.upsert({
    where: { email: "admin@prestigetiles.com" },
    update: { role: "SUPER_ADMIN" },
    create: {
      email: "admin@prestigetiles.com",
      name: "Aditya Hegde",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });
  console.log("Seeded Super Admin:", adminUser.email);

  // 2. Manager
  const managerUser = await db.user.upsert({
    where: { email: "manager@prestigetiles.com" },
    update: { role: "MANAGER", warehouse_id: warehouse.id },
    create: {
      email: "manager@prestigetiles.com",
      name: "Suresh Gowda",
      password: hashedPassword,
      role: "MANAGER",
      status: "ACTIVE",
      warehouse_id: warehouse.id,
    },
  });
  console.log("Seeded Manager:", managerUser.email);

  // 3. Former dealer login — retired to WEAVER (read-only) in Phase 1
  const dealerUser = await db.user.upsert({
    where: { email: "dealer@prestigetiles.com" },
    update: { role: "WEAVER", dealer_id: dealer.id },
    create: {
      email: "dealer@prestigetiles.com",
      name: "Ramesh Kumar (ABC)",
      password: hashedPassword,
      role: "WEAVER",
      status: "ACTIVE",
      dealer_id: dealer.id,
    },
  });
  console.log("Seeded Dealer:", dealerUser.email);

  // 4. Weaver (read-only; replaces the old VIEWER role)
  const viewerUser = await db.user.upsert({
    where: { email: "viewer@prestigetiles.com" },
    update: { role: "WEAVER" },
    create: {
      email: "viewer@prestigetiles.com",
      name: "Sanjay Sen",
      password: hashedPassword,
      role: "WEAVER",
      status: "ACTIVE",
    },
  });
  console.log("Seeded Viewer:", viewerUser.email);

  // 5. Showroom In-Charge
  const inchargeUser = await db.user.upsert({
    where: { email: "incharge@prestigetiles.com" },
    update: { role: "SHOWROOM_INCHARGE", showroomId: showroom.id },
    create: {
      email: "incharge@prestigetiles.com",
      name: "Salman Khan",
      password: hashedPassword,
      role: "SHOWROOM_INCHARGE",
      status: "ACTIVE",
      showroomId: showroom.id,
    },
  });
  console.log("Seeded Showroom In-Charge:", inchargeUser.email);

  // 6. Showroom Staff
  const staffUser = await db.user.upsert({
    where: { email: "staff@prestigetiles.com" },
    update: { role: "SHOWROOM_STAFF", showroomId: showroom.id },
    create: {
      email: "staff@prestigetiles.com",
      name: "Samshudin Shah",
      password: hashedPassword,
      role: "SHOWROOM_STAFF",
      status: "ACTIVE",
      showroomId: showroom.id,
    },
  });
  console.log("Seeded Showroom Staff:", staffUser.email);

  console.log("[SEED] B2B portal users seeded successfully! All passwords are 'prestige123'.");
}

main();
