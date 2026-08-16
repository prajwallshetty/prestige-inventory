import { db } from "@/lib/db";
import { getCache, setCache, deleteCache, publishEvent } from "@/lib/redis";

// Redis key formats
const unreadCountKey = (userId: string) => `notifications:unread_count:${userId}`;
const notificationsListKey = (userId: string, limit: number) => `notifications:list:${userId}:${limit}`;

export async function createNotification({
  userId,
  type,
  title,
  message,
  priority = "NORMAL",
  data = null,
}: {
  userId: string;
  type: string;
  title: string;
  message: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  data?: any;
}) {
  // 1. Create in PostgreSQL source of truth
  const notification = await db.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      priority,
      data: data ? JSON.stringify(data) : undefined,
    },
  });

  // 2. Clear caching for immediate feedback
  await deleteCache(unreadCountKey(userId));
  await deleteCache(notificationsListKey(userId, 20));

  // 3. Publish real-time events for listening clients
  await publishEvent(`user-notifications:${userId}`, {
    action: "NEW_NOTIFICATION",
    notification: {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      createdAt: notification.createdAt,
      isRead: false,
    },
  });

  return notification;
}

export async function getNotifications(userId: string, limit = 20) {
  const cacheKey = notificationsListKey(userId, limit);
  const cached = await getCache<any[]>(cacheKey);
  if (cached) return cached;

  const notifications = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Cache list temporarily (2 minutes)
  await setCache(cacheKey, notifications, 120);
  return notifications;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const cacheKey = unreadCountKey(userId);
  const cached = await getCache<number>(cacheKey);
  if (cached !== null && cached !== undefined) return cached;

  const count = await db.notification.count({
    where: { userId, isRead: false },
  });

  // Cache count temporarily (5 minutes)
  await setCache(cacheKey, count, 300);
  return count;
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  const notif = await db.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notif) throw new Error("Notification not found or unauthorized.");

  const updated = await db.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  await deleteCache(unreadCountKey(userId));
  await deleteCache(notificationsListKey(userId, 20));

  return updated;
}

export async function markAllNotificationsAsRead(userId: string) {
  await db.notification.updateMany({
    where: { userId, isRead: false },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  await deleteCache(unreadCountKey(userId));
  await deleteCache(notificationsListKey(userId, 20));
}

export async function deleteNotification(userId: string, notificationId: string) {
  const notif = await db.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notif) throw new Error("Notification not found or unauthorized.");

  await db.notification.delete({
    where: { id: notificationId },
  });

  await deleteCache(unreadCountKey(userId));
  await deleteCache(notificationsListKey(userId, 20));
}

/** Translates an audience selection into a User `where` clause. */
function audienceWhere(audienceType: string, audienceFilter?: string | null) {
  const where: any = {};
  if (audienceType === "DEALERS") {
    where.role = "DEALER";
  } else if (audienceType === "MANAGERS") {
    where.role = "MANAGER";
  } else if (audienceType === "SHOWROOM_STAFF") {
    where.role = "SHOWROOM_STAFF";
  } else if (audienceType === "SHOWROOM_INCHARGE") {
    where.role = "SHOWROOM_INCHARGE";
  } else if (audienceType === "VIEWERS") {
    where.role = "VIEWER";
  } else if (audienceType === "SPECIFIC_DEALER") {
    where.role = "DEALER";
    where.dealer_id = audienceFilter;
  } else if (audienceType === "SPECIFIC_SHOWROOM") {
    where.showroomId = audienceFilter;
  } else if (audienceType === "SPECIFIC_WAREHOUSE") {
    where.warehouse_id = audienceFilter;
  } else if (audienceType === "SPECIFIC_USER") {
    where.id = audienceFilter;
  }
  return where;
}

/**
 * Materialises an announcement for its audience: recipient rows, in-app
 * notifications, cache invalidation and realtime push.
 *
 * Extracted so an immediate send and a scheduled send that fires later go
 * through exactly the same path. `deliveredAt` is stamped here — it is the
 * moment the message actually reached the user's feed, which is what the
 * delivery analytics report on.
 */
async function fanOutAnnouncement(
  tx: any,
  announcement: { id: string; title: string; message: string; priority: string; audienceType: string; audienceFilter: string | null }
) {
  const targetUsers = await tx.user.findMany({
    where: audienceWhere(announcement.audienceType, announcement.audienceFilter),
    select: { id: true },
  });

  if (targetUsers.length === 0) return 0;

  const deliveredAt = new Date();

  await tx.announcementRecipient.createMany({
    data: targetUsers.map((u: { id: string }) => ({
      announcementId: announcement.id,
      userId: u.id,
      deliveredAt,
    })),
    skipDuplicates: true,
  });

  await tx.notification.createMany({
    data: targetUsers.map((u: { id: string }) => ({
      userId: u.id,
      type: "SYSTEM_ANNOUNCEMENT",
      title: `Broadcast: ${announcement.title}`,
      message: announcement.message,
      priority: announcement.priority,
      data: JSON.stringify({ announcementId: announcement.id }),
    })),
  });

  for (const u of targetUsers) {
    await deleteCache(unreadCountKey(u.id));
    await deleteCache(notificationsListKey(u.id, 20));
    await publishEvent(`user-notifications:${u.id}`, {
      action: "NEW_NOTIFICATION",
      notification: {
        title: `Broadcast: ${announcement.title}`,
        message: announcement.message,
        priority: announcement.priority,
        createdAt: deliveredAt,
        isRead: false,
      },
    });
  }

  return targetUsers.length;
}

export async function createAnnouncement({
  createdById,
  title,
  message,
  priority = "NORMAL",
  audienceType,
  audienceFilter = null,
  scheduledAt = null,
  expiresAt = null,
}: {
  createdById: string;
  title: string;
  message: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  audienceType: string;
  audienceFilter?: string | null;
  /** Future date defers the send; null/past sends immediately. */
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
}) {
  const isScheduled = !!scheduledAt && scheduledAt.getTime() > Date.now();

  return await db.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        createdById,
        title,
        message,
        priority,
        audienceType,
        audienceFilter,
        scheduledAt,
        expiresAt,
        status: isScheduled ? "SCHEDULED" : "SENT",
      },
    });

    // A scheduled announcement stays dormant — no recipients, no
    // notifications — until the cron promotes it. Fanning out at creation
    // time would deliver it immediately and defeat the schedule.
    if (!isScheduled) {
      await fanOutAnnouncement(tx, announcement);
    }

    return announcement;
  });
}

/**
 * Promotes due SCHEDULED announcements to SENT and delivers them.
 * Safe to call repeatedly — the status transition is the idempotency guard.
 */
export async function publishScheduledAnnouncements() {
  const now = new Date();
  const due = await db.announcement.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
  });

  let published = 0;
  let delivered = 0;

  for (const announcement of due) {
    try {
      await db.$transaction(async (tx) => {
        // Re-check inside the transaction so two overlapping cron runs can't
        // both fan out the same announcement.
        const fresh = await tx.announcement.findUnique({ where: { id: announcement.id } });
        if (!fresh || fresh.status !== "SCHEDULED") return;

        const count = await fanOutAnnouncement(tx, fresh);
        await tx.announcement.update({
          where: { id: fresh.id },
          data: { status: "SENT" },
        });
        published++;
        delivered += count;
      });
    } catch (err) {
      console.error(`[ANNOUNCEMENT SCHEDULER] Failed publishing ${announcement.id}:`, err);
    }
  }

  return { due: due.length, published, delivered };
}

/** Marks SENT announcements past their expiry as EXPIRED. */
export async function expireAnnouncements() {
  const now = new Date();
  const result = await db.announcement.updateMany({
    where: { status: "SENT", expiresAt: { not: null, lte: now } },
    data: { status: "EXPIRED" },
  });
  return { expired: result.count };
}

export async function sendNotificationsToUsers({
  userIds,
  type,
  title,
  message,
  priority = "NORMAL",
  data = null,
}: {
  userIds: string[];
  type: string;
  title: string;
  message: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  data?: any;
}) {
  if (!userIds || userIds.length === 0) return;
  const uniqueIds = Array.from(new Set(userIds));

  for (const uid of uniqueIds) {
    await createNotification({
      userId: uid,
      type,
      title,
      message,
      priority,
      data,
    });
  }
}

export async function getAnnouncementsHistory(limit = 20) {
  const announcements = await db.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      recipients: {
        select: {
          id: true,
          userId: true,
          deliveredAt: true,
          readAt: true,
          user: { select: { name: true, email: true, role: true } },
        },
      },
    },
  });

  return announcements.map((a) => {
    const totalRecipients = a.recipients.length;
    const readCount = a.recipients.filter((r) => r.readAt !== null).length;
    const deliveredCount = a.recipients.filter((r) => r.deliveredAt !== null).length;
    const unreadCount = totalRecipients - readCount;
    return {
      ...a,
      totalRecipients,
      readCount,
      deliveredCount,
      unreadCount,
      // Rounded percentage; 0 recipients reads as 0 rather than NaN.
      readRate: totalRecipients > 0 ? Math.round((readCount / totalRecipients) * 100) : 0,
    };
  });
}

