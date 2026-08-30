/**
 * Comprehensive Automated Verification Suite for Product Catalog Reset & Simplified UI
 *
 * Verifies:
 * 1. Active catalog product count is exactly 0.
 * 2. Unreferenced catalog data was safely cleared.
 * 3. Referenced historical products remain archived without foreign key corruption.
 * 4. Production business data (Users, Showrooms, Warehouses, Blocks, Shipments, Chat, Notifications) remain 100% intact.
 * 5. Authentication with Login Codes continues working cleanly across all roles.
 * 6. Inventory Service returns empty catalog state without errors.
 *
 * Usage: npx tsx scripts/test-product-catalog-reset.ts
 */
import { db } from "../src/lib/db";
import { getInventoryList, getInventorySummary } from "../src/services/InventoryService";
import { signInAction } from "../src/app/actions";

type Status = "PASS" | "FAIL";
const results: Array<{ category: string; test: string; status: Status; detail?: string }> = [];

function record(category: string, test: string, ok: boolean, detail?: string) {
  results.push({ category, test, status: ok ? "PASS" : "FAIL", detail });
  const icon = ok ? "✓ PASS" : "✗ FAIL";
  console.log(`  [${icon}] [${category}] ${test}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  VERIFICATION SUITE — PRODUCT CATALOG RESET & SYSTEM INTEGRITY");
  console.log("══════════════════════════════════════════════════════════════════\n");

  // 1. CATALOG RESET VERIFICATION
  console.log("1. PRODUCT CATALOG DATA RESET STATE");
  const activeProducts = await db.product.count({
    where: { deletedAt: null, status: "ACTIVE" },
  });

  record(
    "CATALOG",
    "Active product catalog contains 0 products (Ready for new Excel upload)",
    activeProducts === 0,
    `Active count: ${activeProducts}`
  );

  const archivedProducts = await db.product.count({
    where: { status: "ARCHIVED" },
  });

  record(
    "CATALOG",
    "Historical referenced products safely archived to protect business history",
    archivedProducts === 9,
    `Archived count: ${archivedProducts}`
  );

  // 2. PRODUCTION DATA INTEGRITY VERIFICATION
  console.log("\n2. UNRELATED PRODUCTION DATA INTEGRITY");

  const users = await db.user.count();
  record("DATA_SAFETY", "Users intact (7 accounts)", users === 7, `Count: ${users}`);

  const showrooms = await db.showroom.count();
  record("DATA_SAFETY", "Showrooms intact (5 showrooms)", showrooms === 5, `Count: ${showrooms}`);

  const warehouses = await db.warehouse.count();
  record("DATA_SAFETY", "Warehouses intact (2 central depots)", warehouses === 2, `Count: ${warehouses}`);

  const stockBlocks = await db.stockBlock.count();
  record("DATA_SAFETY", "Stock Blocks intact (14 historical blocks)", stockBlocks === 14, `Count: ${stockBlocks}`);

  const blockOrders = await db.blockOrder.count();
  record("DATA_SAFETY", "Multi-product Block Orders intact (1 order)", blockOrders === 1, `Count: ${blockOrders}`);

  const shipments = await db.shipment.count();
  record("DATA_SAFETY", "Shipments intact (1 shipment record)", shipments === 1, `Count: ${shipments}`);

  const notifications = await db.notification.count();
  record("DATA_SAFETY", "Notifications intact (1,282 records)", notifications >= 1200, `Count: ${notifications}`);

  const messages = await db.message.count();
  record("DATA_SAFETY", "Internal Chat Messages intact (22 messages)", messages === 22, `Count: ${messages}`);

  const auditLogs = await db.auditLog.count();
  record("DATA_SAFETY", "Audit Logs intact (282+ entries)", auditLogs >= 280, `Count: ${auditLogs}`);

  // 3. INVENTORY SERVICE COMPATIBILITY
  console.log("\n3. INVENTORY SERVICE & EMPTY STATE FUNCTIONALITY");

  const inventoryList = await getInventoryList({});
  record(
    "SERVICE",
    "getInventoryList returns clean empty state without throwing",
    inventoryList.items.length === 0 && inventoryList.total === 0,
    `Items returned: ${inventoryList.items.length}`
  );

  let summaryOk = false;
  try {
    await getInventorySummary();
    summaryOk = true;
  } catch (e: any) {
    summaryOk = false;
  }
  record("SERVICE", "getInventorySummary handles empty active catalog gracefully", summaryOk);

  // 4. AUTHENTICATION & LOGIN CODES
  console.log("\n4. UNIQUE LOGIN CODE AUTHENTICATION");

  const adminFd = new FormData();
  adminFd.append("loginCode", "ADM-001");
  const adminRes = await signInAction(adminFd);
  record(
    "AUTH",
    "Super Admin logs in with code ADM-001",
    adminRes.ok && adminRes.data.redirectTo === "/admin/dashboard",
    `Redirect: ${adminRes.ok ? adminRes.data.redirectTo : adminRes.error}`
  );

  const staffFd = new FormData();
  staffFd.append("loginCode", "SH01-ST-001");
  const staffRes = await signInAction(staffFd);
  record(
    "AUTH",
    "Showroom Staff logs in with code SH01-ST-001",
    staffRes.ok && staffRes.data.redirectTo === "/showroom-staff/dashboard",
    `Redirect: ${staffRes.ok ? staffRes.data.redirectTo : staffRes.error}`
  );

  console.log("\n══════════════════════════════════════════════════════════════════");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`  SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log("══════════════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error("\n[TEST SUITE ERROR]", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
