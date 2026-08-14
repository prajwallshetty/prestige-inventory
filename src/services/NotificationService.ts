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

export async function createAnnouncement({
  createdById,
  title,
  message,
  priority = "NORMAL",
  audienceType,
  audienceFilter = null,
}: {
  createdById: string;
  title: string;
  message: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  audienceType: string;
  audienceFilter?: string | null;
}) {
  return await db.$transaction(async (tx) => {
    // 1. Save main announcement details
    const announcement = await tx.announcement.create({
      data: {
        createdById,
        title,
        message,
        priority,
        audienceType,
        audienceFilter,
      },
    });

    // 2. Compile recipient user lists
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

    const targetUsers = await tx.user.findMany({
      where,
      select: { id: true },
    });

    if (targetUsers.length > 0) {
      // 3. Create broadcast logs
      const recipientsData = targetUsers.map((u) => ({
        announcementId: announcement.id,
        userId: u.id,
      }));

      await tx.announcementRecipient.createMany({
        data: recipientsData,
      });

      // 4. Create in-app feed notifications
      const notifsData = targetUsers.map((u) => ({
        userId: u.id,
        type: "SYSTEM_ANNOUNCEMENT",
        title: `Broadcast: ${title}`,
        message,
        priority,
        data: JSON.stringify({ announcementId: announcement.id }),
      }));

      await tx.notification.createMany({
        data: notifsData,
      });

      // 5. Fan-out Redis cleanups and real-time triggers
      for (const u of targetUsers) {
        await deleteCache(unreadCountKey(u.id));
        await deleteCache(notificationsListKey(u.id, 20));
        await publishEvent(`user-notifications:${u.id}`, {
          action: "NEW_NOTIFICATION",
          notification: {
            title: `Broadcast: ${title}`,
            message,
            priority,
            createdAt: new Date(),
            isRead: false,
          },
        });
      }
    }

    return announcement;
  });
}
