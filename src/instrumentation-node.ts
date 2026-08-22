/**
 * In-process schedulers.
 *
 * Expiry previously only happened when somebody hit the cron URL by hand, so
 * lapsed reservations kept holding stock indefinitely (spec §16 — "the
 * scheduler must actually execute this; do not leave expiry dependent on
 * somebody visiting the page").
 *
 * The interval runs in the Node.js server runtime only. It is idempotent and
 * transactional, so an external scheduler (Vercel Cron, systemd timer, k8s
 * CronJob) hitting the same routes remains safe and is still recommended for
 * multi-instance deployments — set `DISABLE_INTERNAL_SCHEDULER=1` there to
 * avoid every replica sweeping at once.
 */

const EXPIRY_INTERVAL_MS = Number(process.env.EXPIRY_SWEEP_INTERVAL_MS || 5 * 60 * 1000);
const ANNOUNCEMENT_INTERVAL_MS = Number(process.env.ANNOUNCEMENT_SWEEP_INTERVAL_MS || 60 * 1000);

declare global {
  // eslint-disable-next-line no-var
  var __prestigeSchedulersStarted: boolean | undefined;
}

export async function startSchedulers() {
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "1") {
    console.log("[SCHEDULER] Internal scheduler disabled by environment.");
    return;
  }
  // Hot reload re-runs `register`; without this every reload adds a timer.
  if (globalThis.__prestigeSchedulersStarted) return;
  globalThis.__prestigeSchedulersStarted = true;

  const { releaseExpiredBlocks } = await import("@/services/StockBlockService");
  const { releaseExpiredBookings } = await import("@/services/BookingService");
  const { publishScheduledAnnouncements, expireAnnouncements } = await import(
    "@/services/NotificationService"
  );

  let expirySweepRunning = false;
  const runExpirySweep = async () => {
    // A slow sweep must not overlap itself and pile up transactions.
    if (expirySweepRunning) return;
    expirySweepRunning = true;
    try {
      const blocks = await releaseExpiredBlocks();
      const bookings = await releaseExpiredBookings();
      if (blocks.released > 0 || blocks.warningsSent > 0) {
        console.log(
          `[SCHEDULER] Expiry sweep: ${blocks.released} block(s) expired, ${blocks.warningsSent} warning(s) sent.`
        );
      }
      if ((bookings as any)?.released > 0) {
        console.log(`[SCHEDULER] Expiry sweep: ${(bookings as any).released} booking(s) released.`);
      }
    } catch (err) {
      console.error("[SCHEDULER] Expiry sweep failed:", err);
    } finally {
      expirySweepRunning = false;
    }
  };

  let announcementSweepRunning = false;
  const runAnnouncementSweep = async () => {
    if (announcementSweepRunning) return;
    announcementSweepRunning = true;
    try {
      await publishScheduledAnnouncements();
      await expireAnnouncements();
    } catch (err) {
      console.error("[SCHEDULER] Announcement sweep failed:", err);
    } finally {
      announcementSweepRunning = false;
    }
  };

  // `unref` keeps the timers from holding the process open during shutdown.
  setInterval(runExpirySweep, EXPIRY_INTERVAL_MS).unref?.();
  setInterval(runAnnouncementSweep, ANNOUNCEMENT_INTERVAL_MS).unref?.();

  // A first pass shortly after boot catches anything that lapsed while the
  // server was down, without delaying startup itself.
  setTimeout(runExpirySweep, 15_000).unref?.();
  setTimeout(runAnnouncementSweep, 20_000).unref?.();

  console.log(
    `[SCHEDULER] Started — expiry every ${Math.round(EXPIRY_INTERVAL_MS / 1000)}s, announcements every ${Math.round(ANNOUNCEMENT_INTERVAL_MS / 1000)}s.`
  );
}
