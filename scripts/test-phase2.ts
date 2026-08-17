/**
 * Phase 2 verification: dealer IDs, notification fan-out, announcement
 * authority, and role management.
 *
 * Everything it creates is namespaced with a marker and removed at the end.
 * Run: npx tsx scripts/test-phase2.ts
 */
import { db } from "../src/lib/db";
import {
  createDealer,
  updateDealer,
  setDealerStatus,
  normaliseDealerCode,
  isValidDealerCode,
  previewDealerId,
} from "../src/services/DealerService";
import {
  ROLES,
  isRole,
  canManageDealers,
  canSendAnnouncements,
  canManageUsers,
} from "../src/lib/permissions";
import {
  createBlockRequest,
  approveBlock,
  markBlockReadyToShip,
  shipBlock,
} from "../src/services/StockBlockService";

const MARKER = "__PHASE2_TEST__";
const TEST_CODE = "ZZT";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function section(t: string) {
  console.log(`\n${t}\n${"-".repeat(t.length)}`);
}

const createdDealerIds: string[] = [];

async function testDealerCodeHelpers() {
  section("1. Dealer code + ID format");
  check("normalises to uppercase", normaliseDealerCode(" pr1 "), "PR1");
  check("valid code accepted", isValidDealerCode("PR1"), true);
  check("too short rejected", isValidDealerCode("A"), false);
  check("symbols rejected", isValidDealerCode("PR-1"), false);
  check("preview format", previewDealerId("PR1", 2026), "2026/PR1/0001");
}

async function testDealerCreation() {
  section("2. Dealer creation + sequential IDs");
  const year = new Date().getFullYear();

  const d1 = await createDealer({ name: `${MARKER} Alpha`, dealerCode: TEST_CODE });
  createdDealerIds.push(d1.id);
  check("first ID ends 0001", d1.dealerId, `${year}/${TEST_CODE}/0001`);
  check("code stored normalised", d1.dealerCode, TEST_CODE);

  const d2 = await createDealer({ name: `${MARKER} Beta`, dealerCode: TEST_CODE.toLowerCase() });
  createdDealerIds.push(d2.id);
  check("second ID increments", d2.dealerId, `${year}/${TEST_CODE}/0002`);

  // A different code keeps its own counter.
  const d3 = await createDealer({ name: `${MARKER} Gamma`, dealerCode: "ZZQ" });
  createdDealerIds.push(d3.id);
  check("separate code starts at 0001", d3.dealerId, `${year}/ZZQ/0001`);

  // Invalid code is refused.
  let rejected = false;
  try {
    await createDealer({ name: `${MARKER} Bad`, dealerCode: "!" });
  } catch {
    rejected = true;
  }
  check("invalid code refused", rejected, true);

  // Audit trail
  const audit = await db.auditLog.findFirst({
    where: { entity: "Dealer", entityId: d1.id, action: "CREATE_DEALER" },
  });
  check("creation is audited", !!audit, true);
}

async function testConcurrentDealerIds() {
  section("3. Concurrent creation cannot duplicate IDs");
  // Spec §3 — the sequence must be safe under simultaneous creation.
  const results = await Promise.all(
    [1, 2, 3].map((n) =>
      createDealer({ name: `${MARKER} Race ${n}`, dealerCode: "ZZR" })
        .then((d) => { createdDealerIds.push(d.id); return d.dealerId; })
        .catch(() => null)
    )
  );
  const ids = results.filter(Boolean) as string[];
  check("all three succeeded", ids.length, 3);
  check("all IDs unique", new Set(ids).size, ids.length);
}

async function testDealerEditDeactivate() {
  section("4. Edit + deactivate");
  const d = await createDealer({ name: `${MARKER} Editable`, dealerCode: "ZZE", contact: "Old" });
  createdDealerIds.push(d.id);
  const originalId = d.dealerId;

  const updated = await updateDealer({ id: d.id, name: `${MARKER} Renamed`, contact: "New" });
  check("name updated", updated.name, `${MARKER} Renamed`);
  check("contact updated", updated.contact, "New");
  check("dealer ID is immutable", updated.dealerId, originalId);

  const deactivated = await setDealerStatus({ id: d.id, status: "INACTIVE" });
  check("deactivated, not deleted", deactivated.status, "INACTIVE");
  const stillThere = await db.dealer.findUnique({ where: { id: d.id } });
  check("record preserved", !!stillThere, true);
}

function testAuthority() {
  section("5. Phase 2 authority");
  check("SUPER_ADMIN manages dealers", canManageDealers("SUPER_ADMIN"), true);
  check("MANAGER CANNOT manage dealers", canManageDealers("MANAGER"), false);
  check("WEAVER CANNOT manage dealers", canManageDealers("WEAVER"), false);
  check("STAFF CANNOT manage dealers", canManageDealers("SHOWROOM_STAFF"), false);

  check("SUPER_ADMIN sends announcements", canSendAnnouncements("SUPER_ADMIN"), true);
  check("MANAGER sends announcements", canSendAnnouncements("MANAGER"), true);
  check("WEAVER CANNOT send announcements", canSendAnnouncements("WEAVER"), false);
  check("STAFF CANNOT send announcements", canSendAnnouncements("SHOWROOM_STAFF"), false);
  check("INCHARGE CANNOT send announcements", canSendAnnouncements("SHOWROOM_INCHARGE"), false);

  check("only SUPER_ADMIN manages users", canManageUsers("SUPER_ADMIN"), true);
  check("MANAGER CANNOT manage users", canManageUsers("MANAGER"), false);

  // Role assignment is limited to the five
  check("still exactly five roles", ROLES.length, 5);
  check("DEALER not assignable", isRole("DEALER"), false);
  check("VIEWER not assignable", isRole("VIEWER"), false);
  check("WEAVER assignable", isRole("WEAVER"), true);
}

async function testNotificationFanOut() {
  section("6. Notification fan-out across the block lifecycle");

  const warehouse = await db.warehouse.findFirst();
  const [staff, incharge, manager, admin] = await Promise.all([
    db.user.findFirst({ where: { role: "SHOWROOM_STAFF" } }),
    db.user.findFirst({ where: { role: "SHOWROOM_INCHARGE" } }),
    db.user.findFirst({ where: { role: "MANAGER" } }),
    db.user.findFirst({ where: { role: "SUPER_ADMIN" } }),
  ]);
  if (!warehouse || !staff || !incharge || !manager || !admin) {
    throw new Error("Expected a warehouse and one user per role.");
  }

  // Put staff and in-charge in the same showroom so audience routing applies.
  const showroom = await db.showroom.findFirst();
  if (showroom) {
    await db.user.updateMany({
      where: { id: { in: [staff.id, incharge.id] } },
      data: { showroomId: showroom.id },
    });
  }

  const product = await db.product.create({
    data: { slug: `phase2-notif-${Date.now()}`, name: `${MARKER} Product`, status: "ACTIVE" },
  });
  const inventory = await db.inventory.create({
    data: { productId: product.id, warehouseId: warehouse.id, totalStock: 50, availableStock: 50, stockStatus: "AVAILABLE" },
  });

  let blockId: string | null = null;
  const since = new Date();

  try {
    const block = await createBlockRequest({
      productId: product.id,
      quantity: 5,
      requestedBy: staff.name,
      createdById: staff.id,
      userRole: "SHOWROOM_STAFF",
      showroomId: showroom?.id,
    });
    blockId = block.id;

    const notifsFor = async (userId: string, type?: string) =>
      db.notification.count({
        where: { userId, createdAt: { gte: since }, ...(type ? { type } : {}) },
      });

    // §10 — staff creation notifies the In-Charge, NOT the Manager.
    check("in-charge notified on create", (await notifsFor(incharge.id, "BLOCK_CREATED")) > 0, true);
    check("manager NOT notified on create", await notifsFor(manager.id, "BLOCK_CREATED"), 0);

    // §11 — in-charge approval notifies manager + super admin
    await approveBlock({ blockId: block.id, approvedBy: incharge.name, approvedById: incharge.id, role: "SHOWROOM_INCHARGE" });
    check("manager notified for final approval", (await notifsFor(manager.id, "BLOCK_SENT_FOR_APPROVAL")) > 0, true);
    check("super admin notified for final approval", (await notifsFor(admin.id, "BLOCK_SENT_FOR_APPROVAL")) > 0, true);

    // §13 — manager approval notifies the creator
    await approveBlock({ blockId: block.id, approvedBy: manager.name, approvedById: manager.id, role: "MANAGER" });
    check("creator notified of approval", (await notifsFor(staff.id, "BLOCK_APPROVED")) > 0, true);

    // §15 — shipping notifies creator + in-charge
    await markBlockReadyToShip({ blockId: block.id, performedBy: manager.name, performedById: manager.id, role: "MANAGER" });
    await shipBlock({ blockId: block.id, performedBy: manager.name, performedById: manager.id, role: "MANAGER" });
    check("creator notified of shipment", (await notifsFor(staff.id, "BLOCK_SHIPPED")) > 0, true);
    check("in-charge notified of shipment", (await notifsFor(incharge.id, "BLOCK_SHIPPED")) > 0, true);

    // Notifications carry the block reference so the UI can deep-link.
    const sample = await db.notification.findFirst({
      where: { userId: staff.id, type: "BLOCK_APPROVED", createdAt: { gte: since } },
    });
    const data = sample?.data as any;
    check("notification links to the block", data?.blockId, block.id);
  } finally {
    await db.notification.deleteMany({ where: { createdAt: { gte: since }, title: { contains: "Block" } } });
    if (blockId) {
      await db.auditLog.deleteMany({ where: { entity: "StockBlock", entityId: blockId } });
      await db.stockBlock.deleteMany({ where: { id: blockId } });
    }
    await db.inventoryMovement.deleteMany({ where: { inventoryId: inventory.id } });
    await db.inventory.deleteMany({ where: { id: inventory.id } });
    await db.product.deleteMany({ where: { id: product.id } });
  }
}

async function cleanup() {
  if (createdDealerIds.length) {
    await db.auditLog.deleteMany({ where: { entity: "Dealer", entityId: { in: createdDealerIds } } });
    await db.dealer.deleteMany({ where: { id: { in: createdDealerIds } } });
  }
  await db.dealerSequence.deleteMany({ where: { dealerCode: { in: [TEST_CODE, "ZZQ", "ZZR", "ZZE"] } } });
  console.log("\n(test data cleaned up)");
}

async function main() {
  try {
    await testDealerCodeHelpers();
    await testDealerCreation();
    await testConcurrentDealerIds();
    await testDealerEditDeactivate();
    testAuthority();
    await testNotificationFanOut();
  } finally {
    await cleanup();
  }

  console.log("\n" + "=".repeat(52));
  console.log(`${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log("\nFAILURES:");
    failures.forEach((f) => console.log("  - " + f));
  }
  console.log("=".repeat(52));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("[TEST ERROR]", e);
  await cleanup().catch(() => {});
  process.exit(1);
});
