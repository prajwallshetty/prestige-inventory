/**
 * End-to-end check of announcement scheduling, delivery, idempotency and expiry.
 *
 * Creates a throwaway announcement, drives it through the scheduler, then
 * deletes everything it made. Run with: npx tsx scripts/test-announcement-scheduling.ts
 */
import { createAnnouncement, publishScheduledAnnouncements, expireAnnouncements } from "../src/services/NotificationService";
import { db } from "../src/lib/db";

const TITLE = "__TEST__ Scheduled Broadcast";
let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  ok ? pass++ : fail++;
}

async function main() {
  const admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!admin) throw new Error("No SUPER_ADMIN user to author the test announcement.");

  let announcementId: string | null = null;

  try {
    console.log("\n1. Scheduled announcement stays dormant until due");
    const created = await createAnnouncement({
      createdById: admin.id,
      title: TITLE,
      message: "should not deliver yet",
      audienceType: "ALL",
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    announcementId = created.id;

    let row = await db.announcement.findUniqueOrThrow({
      where: { id: created.id },
      include: { recipients: true },
    });
    check("status is SCHEDULED", row.status, "SCHEDULED");
    check("no recipients yet", row.recipients.length, 0);

    console.log("\n2. Cron ignores announcements that are not due");
    let result = await publishScheduledAnnouncements();
    check("published nothing", result.published, 0);

    console.log("\n3. Once due, cron delivers it");
    await db.announcement.update({
      where: { id: created.id },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    result = await publishScheduledAnnouncements();
    check("published one", result.published, 1);

    row = await db.announcement.findUniqueOrThrow({
      where: { id: created.id },
      include: { recipients: true },
    });
    check("status flipped to SENT", row.status, "SENT");
    check("recipients created", row.recipients.length > 0, true);
    check("deliveredAt stamped on all", row.recipients.every((r) => r.deliveredAt !== null), true);
    const deliveredCount = row.recipients.length;

    console.log("\n4. Re-running the cron does not double-deliver");
    result = await publishScheduledAnnouncements();
    const after = await db.announcement.findUniqueOrThrow({
      where: { id: created.id },
      include: { recipients: true },
    });
    check("published nothing on rerun", result.published, 0);
    check("recipient count unchanged", after.recipients.length, deliveredCount);

    console.log("\n5. Expiry retires a sent announcement");
    await db.announcement.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expireAnnouncements();
    const expired = await db.announcement.findUniqueOrThrow({ where: { id: created.id } });
    check("status is EXPIRED", expired.status, "EXPIRED");
  } finally {
    console.log("\nCleaning up test data...");
    await db.notification.deleteMany({ where: { title: { contains: TITLE } } });
    if (announcementId) {
      await db.announcementRecipient.deleteMany({ where: { announcementId } });
      await db.announcement.deleteMany({ where: { id: announcementId } });
    }
    console.log("Done.");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("[TEST ERROR]", e);
  process.exit(1);
});
