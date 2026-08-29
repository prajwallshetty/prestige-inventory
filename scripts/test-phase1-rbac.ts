/**
 * Phase 1 verification: RBAC matrix, block state machine, and the end-to-end
 * acceptance scenario from the spec.
 *
 * Permission-matrix checks are pure (they exercise src/lib/permissions.ts with
 * no I/O) so the whole grid runs instantly. The workflow test then drives a
 * real block through the database and asserts stock maths and audit trail at
 * each step, cleaning up after itself.
 *
 * Run: npx tsx scripts/test-phase1-rbac.ts
 */
import { db } from "../src/lib/db";
import {
  ROLES,
  type Role,
  type BlockStatus,
  canCreateBlock,
  canApproveBlock,
  canRejectBlock,
  canShipBlock,
  canDeliverBlock,
  canCancelBlock,
  canMarkReadyToShip,
  canManageProducts,
  canManageUsers,
  canManageDealers,
  canViewBlocks,
  canTransition,
} from "../src/lib/permissions";
import {
  createBlockRequest,
  approveBlock,
  shipBlock,
  deliverBlock,
} from "../src/services/StockBlockService";

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

function section(title: string) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

// ————— 1. Role set —————

function testRoleSet() {
  section("1. Role model");
  check("exactly five roles", ROLES.length, 5);
  check("roles are the Phase 1 set", [...ROLES].sort(), [
    "MANAGER", "SHOWROOM_INCHARGE", "SHOWROOM_STAFF", "SUPER_ADMIN", "WEAVER",
  ]);
  check("VIEWER is gone", (ROLES as readonly string[]).includes("VIEWER"), false);
  check("DEALER is gone", (ROLES as readonly string[]).includes("DEALER"), false);
}

// ————— 2. Permission matrix (spec §3 / §21) —————

function testPermissionMatrix() {
  section("2. Permission matrix");

  // View — everyone
  for (const r of ROLES) check(`${r} can view blocks`, canViewBlocks(r), true);

  // Create block — everyone except WEAVER
  check("SUPER_ADMIN can create", canCreateBlock("SUPER_ADMIN"), true);
  check("MANAGER can create", canCreateBlock("MANAGER"), true);
  check("SHOWROOM_INCHARGE can create", canCreateBlock("SHOWROOM_INCHARGE"), true);
  check("SHOWROOM_STAFF can create", canCreateBlock("SHOWROOM_STAFF"), true);
  check("WEAVER CANNOT create", canCreateBlock("WEAVER"), false);

  // Staff-block approval (PENDING_INCHARGE_APPROVAL). Showroom-scoped roles
  // are denied unless the actor's showroom matches the block's (spec §8/§22),
  // so in-scope checks below pass matching showroom ids explicitly.
  const staffStage: BlockStatus = "PENDING_INCHARGE_APPROVAL";
  const sameShowroom = { blockShowroomId: "s1", actorShowroomId: "s1" };
  const otherShowroom = { blockShowroomId: "s1", actorShowroomId: "s2" };
  check("INCHARGE approves staff block in own showroom", canApproveBlock("SHOWROOM_INCHARGE", staffStage, sameShowroom), true);
  check("SUPER_ADMIN approves staff block", canApproveBlock("SUPER_ADMIN", staffStage), true);
  check("STAFF CANNOT approve", canApproveBlock("SHOWROOM_STAFF", staffStage, sameShowroom), false);
  check("WEAVER CANNOT approve", canApproveBlock("WEAVER", staffStage), false);

  // Showroom isolation (spec §22): an In-Charge of a different showroom may
  // never approve this block, regardless of who created it.
  check(
    "INCHARGE of a DIFFERENT showroom CANNOT approve",
    canApproveBlock("SHOWROOM_INCHARGE", staffStage, otherShowroom),
    false
  );

  // In-Charge must never approve their own block (spec §5)
  check(
    "INCHARGE CANNOT approve own block",
    canApproveBlock("SHOWROOM_INCHARGE", staffStage, { ...sameShowroom, createdById: "u1", actorId: "u1" }),
    false
  );
  check(
    "INCHARGE can approve someone else's block",
    canApproveBlock("SHOWROOM_INCHARGE", staffStage, { ...sameShowroom, createdById: "u2", actorId: "u1" }),
    true
  );

  // Final approval (PENDING_MANAGER_APPROVAL) — Manager/Super Admin operate
  // centrally, so no showroom scope applies to them (spec §10/§26).
  const mgrStage: BlockStatus = "PENDING_MANAGER_APPROVAL";
  check("MANAGER final approval", canApproveBlock("MANAGER", mgrStage), true);
  check("SUPER_ADMIN final approval", canApproveBlock("SUPER_ADMIN", mgrStage), true);
  check("INCHARGE CANNOT final approve", canApproveBlock("SHOWROOM_INCHARGE", mgrStage, sameShowroom), false);
  check("STAFF CANNOT final approve", canApproveBlock("SHOWROOM_STAFF", mgrStage, sameShowroom), false);
  check("WEAVER CANNOT final approve", canApproveBlock("WEAVER", mgrStage), false);

  // Reject mirrors approve
  check("INCHARGE can reject staff block in own showroom", canRejectBlock("SHOWROOM_INCHARGE", staffStage, sameShowroom), true);
  check("INCHARGE of a DIFFERENT showroom CANNOT reject", canRejectBlock("SHOWROOM_INCHARGE", staffStage, otherShowroom), false);
  check("STAFF CANNOT reject", canRejectBlock("SHOWROOM_STAFF", staffStage, sameShowroom), false);
  check("WEAVER CANNOT reject", canRejectBlock("WEAVER", mgrStage), false);

  // Ship / deliver — Manager & Super Admin only
  check("MANAGER can ship", canShipBlock("MANAGER", "READY_TO_SHIP"), true);
  check("SUPER_ADMIN can ship", canShipBlock("SUPER_ADMIN", "READY_TO_SHIP"), true);
  check("INCHARGE CANNOT ship", canShipBlock("SHOWROOM_INCHARGE", "READY_TO_SHIP"), false);
  check("STAFF CANNOT ship", canShipBlock("SHOWROOM_STAFF", "READY_TO_SHIP"), false);
  check("WEAVER CANNOT ship", canShipBlock("WEAVER", "READY_TO_SHIP"), false);
  check("cannot ship an unapproved block", canShipBlock("MANAGER", "PENDING_MANAGER_APPROVAL"), false);
  check("MANAGER can deliver shipped", canDeliverBlock("MANAGER", "SHIPPED"), true);
  check("STAFF CANNOT deliver", canDeliverBlock("SHOWROOM_STAFF", "SHIPPED"), false);

  // Ready to ship
  check("MANAGER marks ready to ship", canMarkReadyToShip("MANAGER", "APPROVED"), true);
  check("STAFF CANNOT mark ready", canMarkReadyToShip("SHOWROOM_STAFF", "APPROVED"), false);

  // Cancel own block
  check(
    "STAFF can cancel own active block",
    canCancelBlock("SHOWROOM_STAFF", "PENDING_INCHARGE_APPROVAL", { ...sameShowroom, createdById: "u1", actorId: "u1" }),
    true
  );
  check(
    "STAFF CANNOT cancel someone else's",
    canCancelBlock("SHOWROOM_STAFF", "PENDING_INCHARGE_APPROVAL", { ...sameShowroom, createdById: "u2", actorId: "u1" }),
    false
  );
  check(
    "STAFF of a DIFFERENT showroom CANNOT cancel even their own block",
    canCancelBlock("SHOWROOM_STAFF", "PENDING_INCHARGE_APPROVAL", { ...otherShowroom, createdById: "u1", actorId: "u1" }),
    false
  );
  check("MANAGER can cancel any active block", canCancelBlock("MANAGER", "APPROVED"), true);
  check("cannot cancel a delivered block", canCancelBlock("MANAGER", "DELIVERED"), false);
  check("WEAVER CANNOT cancel", canCancelBlock("WEAVER", "APPROVED", { createdById: "u1", actorId: "u1" }), false);

  // Admin-only surfaces
  check("SUPER_ADMIN manages products", canManageProducts("SUPER_ADMIN"), true);
  check("MANAGER CANNOT manage products", canManageProducts("MANAGER"), false);
  check("MANAGER CANNOT manage users", canManageUsers("MANAGER"), false);
  check("MANAGER CANNOT manage dealers", canManageDealers("MANAGER"), false);
  check("WEAVER CANNOT manage products", canManageProducts("WEAVER"), false);
}

// ————— 3. State machine (spec §9) —————

function testStateMachine() {
  section("3. State machine");
  check("staff stage → manager stage", canTransition("PENDING_INCHARGE_APPROVAL", "PENDING_MANAGER_APPROVAL"), true);
  check("staff stage → rejected", canTransition("PENDING_INCHARGE_APPROVAL", "REJECTED"), true);
  check("manager stage → approved", canTransition("PENDING_MANAGER_APPROVAL", "APPROVED"), true);
  check("approved → ready to ship", canTransition("APPROVED", "READY_TO_SHIP"), true);
  check("ready → shipped", canTransition("READY_TO_SHIP", "SHIPPED"), true);
  check("shipped → delivered", canTransition("SHIPPED", "DELIVERED"), true);

  // Illegal jumps
  check("staff stage CANNOT jump to APPROVED", canTransition("PENDING_INCHARGE_APPROVAL", "APPROVED"), false);
  check("CANNOT skip approval to ship", canTransition("PENDING_MANAGER_APPROVAL", "SHIPPED"), false);
  check("CANNOT ship straight from APPROVED", canTransition("APPROVED", "SHIPPED"), false);
  check("DELIVERED is terminal", canTransition("DELIVERED", "APPROVED"), false);
  check("REJECTED is terminal", canTransition("REJECTED", "APPROVED"), false);
  check("CANCELLED is terminal", canTransition("CANCELLED", "APPROVED"), false);
  check("RELEASED cannot become EXPIRED", canTransition("RELEASED", "EXPIRED"), false);
}

// ————— 4. Acceptance scenario (spec §22) —————

async function testAcceptanceWorkflow() {
  section("4. Acceptance scenario — 100 physical, staff blocks 30");

  const warehouse = await db.warehouse.findFirst();
  if (!warehouse) throw new Error("No warehouse available.");

  // Use real User rows — AuditLog.userId is a foreign key, and production
  // always supplies a genuine session user id.
  const [staffUser, inchargeUser, managerUser, weaverUser] = await Promise.all([
    db.user.findFirst({ where: { role: "SHOWROOM_STAFF" } }),
    db.user.findFirst({ where: { role: "SHOWROOM_INCHARGE" } }),
    db.user.findFirst({ where: { role: "MANAGER" } }),
    db.user.findFirst({ where: { role: "WEAVER" } }),
  ]);
  if (!staffUser || !inchargeUser || !managerUser || !weaverUser) {
    throw new Error("Expected one user per role — run scripts/seed-users.ts first.");
  }

  const product = await db.product.create({
    data: { slug: `phase1-accept-${Date.now()}`, name: "__PHASE1_TEST__ Product", status: "ACTIVE" },
  });
  const inventory = await db.inventory.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: 100,
      availableStock: 100,
      stockStatus: "AVAILABLE",
    },
  });

  let blockId: string | null = null;
  try {
    // Staff creates a block for 30
    const block = await createBlockRequest({
      productId: product.id,
      quantity: 30,
      requestedBy: "Test Staff",
      createdById: staffUser.id,
      userRole: "SHOWROOM_STAFF",
      showroomId: staffUser.showroomId ?? undefined,
    });
    blockId = block.id;

    check("routed to In-Charge", block.status, "PENDING_INCHARGE_APPROVAL");
    check("block number format", /^BLK-\d{4}-\d{6}$/.test(block.block_number || ""), true);

    let inv = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
    check("physical unchanged at 100", inv.totalStock, 100);
    check("blocked is 30", inv.blockedStock, 30);
    check("available is 70", inv.availableStock, 70);

    // Staff cannot approve their own block
    let staffApproveRejected = false;
    try {
      await approveBlock({ blockId: block.id, approvedBy: "Test Staff", approvedById: staffUser.id, role: "SHOWROOM_STAFF" });
    } catch {
      staffApproveRejected = true;
    }
    check("STAFF approval is refused", staffApproveRejected, true);

    // Weaver cannot approve either
    let weaverRejected = false;
    try {
      await approveBlock({ blockId: block.id, approvedBy: "Test Weaver", approvedById: weaverUser.id, role: "WEAVER" });
    } catch {
      weaverRejected = true;
    }
    check("WEAVER approval is refused", weaverRejected, true);

    // In-Charge approves → manager queue
    const afterIncharge = await approveBlock({
      blockId: block.id,
      approvedBy: "Test Incharge",
      approvedById: inchargeUser.id,
      role: "SHOWROOM_INCHARGE",
      actorShowroomId: inchargeUser.showroomId ?? undefined,
    });
    check("now awaiting manager", afterIncharge.status, "PENDING_MANAGER_APPROVAL");
    check("in-charge sign-off recorded", afterIncharge.inchargeApprovedBy, "Test Incharge");

    // Cannot ship before manager approval (still PENDING_MANAGER_APPROVAL)
    let earlyShipRejected = false;
    try {
      await shipBlock({ blockId: block.id, performedBy: "Test Manager", performedById: managerUser.id, role: "MANAGER" });
    } catch {
      earlyShipRejected = true;
    }
    check("cannot ship before approval", earlyShipRejected, true);

    // Manager approves — lands directly on READY_TO_SHIP (spec §4/§10; APPROVED
    // is retained only for historical rows created before this change).
    const afterManager = await approveBlock({
      blockId: block.id,
      approvedBy: "Test Manager",
      approvedById: managerUser.id,
      role: "MANAGER",
    });
    check("approved directly to ready-to-ship", afterManager.status, "READY_TO_SHIP");
    check("manager sign-off recorded", afterManager.managerApprovedBy, "Test Manager");

    inv = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
    check("physical STILL 100 pre-ship", inv.totalStock, 100);

    // Staff cannot ship
    let staffShipRejected = false;
    try {
      await shipBlock({ blockId: block.id, performedBy: "Test Staff", performedById: staffUser.id, role: "SHOWROOM_STAFF" });
    } catch {
      staffShipRejected = true;
    }
    check("STAFF ship is refused", staffShipRejected, true);

    // Manager ships — physical stock now reduces. Vehicle number is mandatory
    // (spec §24-26).
    const shipped = await shipBlock({
      blockId: block.id, performedBy: "Test Manager", performedById: managerUser.id, role: "MANAGER",
      vehicleNumber: "KA-19-TEST-0001",
    });
    check("shipped", shipped.status, "SHIPPED");

    inv = await db.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
    check("physical reduced to 70", inv.totalStock, 70);
    check("blocked released to 0", inv.blockedStock, 0);

    // Deliver
    const delivered = await deliverBlock({
      blockId: block.id, performedBy: "Test Manager", performedById: managerUser.id, role: "MANAGER",
    });
    check("delivered", delivered.status, "DELIVERED");

    // Audit trail
    const audits = await db.auditLog.findMany({
      where: { entity: "StockBlock", entityId: block.id },
      orderBy: { createdAt: "asc" },
    });
    const actions = audits.map((a) => a.action);
    check("audit has full trail", actions, [
      "CREATE_BLOCK", "APPROVE_BLOCK", "APPROVE_BLOCK", "SHIP_BLOCK", "DELIVER_BLOCK",
    ]);
    check("audit records old→new status", !!(audits[1].oldValue && audits[1].newValue), true);
    check("audit records the actor's role", audits[1].roleAtTime, "SHOWROOM_INCHARGE");
  } finally {
    if (blockId) {
      await db.auditLog.deleteMany({ where: { entity: "StockBlock", entityId: blockId } });
      await db.stockBlock.deleteMany({ where: { id: blockId } });
    }
    await db.inventoryMovement.deleteMany({ where: { inventoryId: inventory.id } });
    await db.inventory.deleteMany({ where: { id: inventory.id } });
    await db.product.deleteMany({ where: { id: product.id } });
    console.log("\n(test data cleaned up)");
  }
}

async function main() {
  testRoleSet();
  testPermissionMatrix();
  testStateMachine();
  await testAcceptanceWorkflow();

  console.log("\n" + "=".repeat(52));
  console.log(`${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log("\nFAILURES:");
    failures.forEach((f) => console.log("  - " + f));
  }
  console.log("=".repeat(52));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[TEST ERROR]", e);
  process.exit(1);
});
