import { db } from "@/lib/db";
import { ConversationType, MessageType, Prisma } from "@prisma/client";
import { publishEvent } from "@/lib/redis";
import { ROLES } from "@/lib/permissions";

/**
 * `User.role` is a Prisma enum — `contains`/`mode: "insensitive"` are string-only
 * filters and Prisma throws "Unknown argument `contains`" for an enum field.
 * Matches only an exact (case-insensitive) role name, e.g. "manager" -> MANAGER.
 */
function matchingRole(query: string): (typeof ROLES)[number] | null {
  const normalized = query.trim().toUpperCase().replace(/\s+/g, "_");
  return (ROLES as readonly string[]).includes(normalized) ? (normalized as (typeof ROLES)[number]) : null;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  createdBy: string;
  participantIds: string[];
  blockId?: string;
  shipmentId?: string;
  productId?: string;
  dealerId?: string;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  type?: MessageType;
  content: string;
  attachmentUrl?: string;
  attachmentKey?: string;
  attachmentName?: string;
  replyToId?: string;
  metadata?: string;
  userRole?: string;
  clientMessageId?: string;
}

/**
 * Finds or creates a 1-on-1 Direct Conversation between User A and User B.
 */
export async function getOrCreateDirectConversation(userId1: string, userId2: string) {
  if (userId1 === userId2) {
    throw new Error("Cannot start a direct chat with yourself");
  }

  // Find existing DIRECT conversation containing both participants
  const existing = await db.conversation.findFirst({
    where: {
      type: "DIRECT",
      active: true,
      AND: [
        { participants: { some: { userId: userId1 } } },
        { participants: { some: { userId: userId2 } } },
      ],
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, avatar: true, status: true },
          },
        },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, name: true, avatar: true } } },
      },
    },
  });

  if (existing) {
    return existing;
  }

  // Verify both users exist
  const users = await db.user.findMany({
    where: { id: { in: [userId1, userId2] } },
    select: { id: true, name: true },
  });

  if (users.length < 2) {
    throw new Error("One or both specified users do not exist");
  }

  // Create new DIRECT conversation
  const created = await db.conversation.create({
    data: {
      type: "DIRECT",
      createdBy: userId1,
      participants: {
        create: [
          { userId: userId1, isAdmin: true },
          { userId: userId2, isAdmin: false },
        ],
      },
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, avatar: true, status: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  await db.chatAudit.create({
    data: {
      conversationId: created.id,
      actingUserId: userId1,
      action: "CONVERSATION_CREATED",
      details: JSON.stringify({ type: "DIRECT", partnerId: userId2 }),
    },
  });

  await publishEvent(`user-chat:${userId2}`, {
    action: "CONVERSATION_UPDATED",
    conversationId: created.id,
  });

  return created;
}

/**
 * Creates a Group operational conversation.
 */
export async function createGroupConversation(input: CreateGroupInput) {
  const { name, description, createdBy, participantIds, blockId, shipmentId, productId, dealerId } = input;

  if (!name || name.trim().length === 0) {
    throw new Error("Group name is required");
  }

  // Deduplicate participants and include creator
  const uniqueParticipants = Array.from(new Set([createdBy, ...participantIds]));

  const conversation = await db.conversation.create({
    data: {
      type: "GROUP",
      name: name.trim(),
      description: description?.trim() || null,
      blockId: blockId || null,
      shipmentId: shipmentId || null,
      productId: productId || null,
      dealerId: dealerId || null,
      createdBy,
      participants: {
        create: uniqueParticipants.map((uid) => ({
          userId: uid,
          isAdmin: uid === createdBy,
        })),
      },
      messages: {
        create: {
          senderId: createdBy,
          type: "SYSTEM_EVENT",
          content: `Group "${name.trim()}" created.`,
        },
      },
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, avatar: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  await db.chatAudit.create({
    data: {
      conversationId: conversation.id,
      actingUserId: createdBy,
      action: "CONVERSATION_CREATED",
      details: JSON.stringify({ type: "GROUP", name, participantCount: uniqueParticipants.length }),
    },
  });

  await Promise.all(
    uniqueParticipants
      .filter((uid) => uid !== createdBy)
      .map((uid) =>
        publishEvent(`user-chat:${uid}`, {
          action: "CONVERSATION_UPDATED",
          conversationId: conversation.id,
        })
      )
  );

  return conversation;
}

/**
 * Fetches all conversations accessible by a user (or all company conversations if Super Admin View is enabled).
 */
export async function getConversationsForUser(
  userId: string,
  options: {
    userRole: string;
    isSuperAdminView?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }
) {
  const { userRole, isSuperAdminView = false, search = "", page = 1, limit = 30 } = options;
  const skip = (Math.max(1, page) - 1) * limit;

  const isAdminGlobal = isSuperAdminView && userRole === "SUPER_ADMIN";

  const whereClause: any = { active: true };

  if (!isAdminGlobal) {
    whereClause.participants = {
      some: { userId },
    };
  }

  if (search && search.trim().length > 0) {
    const q = search.trim();
    whereClause.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { blockId: { contains: q, mode: "insensitive" } },
      { shipmentId: { contains: q, mode: "insensitive" } },
      {
        participants: {
          some: {
            user: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                ...(matchingRole(q) ? [{ role: matchingRole(q)! }] : []),
              ],
            },
          },
        },
      },
      {
        messages: {
          some: {
            content: { contains: q, mode: "insensitive" },
            deletedAt: null,
          },
        },
      },
    ];
  }

  const [conversations, total] = await Promise.all([
    db.conversation.findMany({
      where: whereClause,
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
                status: true,
                showroom: { select: { name: true } },
              },
            },
          },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            type: true,
            senderId: true,
            attachmentName: true,
            createdAt: true,
            // attachmentUrl/metadata deliberately excluded — attachments are
            // stored inline (data URLs) until real object storage is wired
            // in, and this list is polled by every participant every few
            // seconds, so pulling multi-MB blobs here just for a preview
            // that never renders them is pure waste.
            sender: { select: { id: true, name: true, avatar: true, role: true } },
          },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: limit,
    }),
    db.conversation.count({ where: whereClause }),
  ]);

  const convIds = conversations.map((c) => c.id);
  const unreadCountMap = new Map<string, number>();

  if (convIds.length > 0) {
    const unreadRows = await db.$queryRaw<Array<{ conversation_id: string; unread_count: bigint }>>`
      SELECT m.conversation_id, COUNT(m.id) as unread_count
      FROM "Message" m
      JOIN "ConversationParticipant" cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ${userId}
      WHERE m.conversation_id IN (${Prisma.join(convIds)})
        AND m.sender_id != ${userId}
        AND m.deleted_at IS NULL
        AND m.created_at > cp.last_read_at
      GROUP BY m.conversation_id
    `;
    for (const row of unreadRows) {
      unreadCountMap.set(row.conversation_id, Number(row.unread_count));
    }
  }

  // Map conversations with unread counts & partner info
  const items = conversations.map((conv) => {
    const myParticipant = conv.participants.find((p) => p.userId === userId);
    const unreadCount = unreadCountMap.get(conv.id) || 0;

    // Direct partner info
    let partner = null;
    if (conv.type === "DIRECT") {
      const otherP = conv.participants.find((p) => p.userId !== userId);
      partner = otherP?.user || conv.participants[0]?.user || null;
    }

    const lastMsg = conv.messages[0] || null;

    return {
      id: conv.id,
      type: conv.type,
      name: conv.name || partner?.name || "Direct Chat",
      description: conv.description,
      icon: conv.icon,
      blockId: conv.blockId,
      shipmentId: conv.shipmentId,
      productId: conv.productId,
      dealerId: conv.dealerId,
      createdBy: conv.createdBy,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      lastMessageAt: conv.lastMessageAt,
      unreadCount,
      isMuted: myParticipant?.muted || false,
      partner,
      participants: conv.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
        role: p.user.role,
        avatar: p.user.avatar,
        showroomName: p.user.showroom?.name || null,
        isAdmin: p.isAdmin,
        joinedAt: p.joinedAt,
      })),
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            content: lastMsg.content,
            type: lastMsg.type,
            senderId: lastMsg.senderId,
            senderName: lastMsg.sender?.name || "System",
            attachmentName: lastMsg.attachmentName,
            createdAt: lastMsg.createdAt,
          }
        : null,
      isSuperAdminView: isAdminGlobal && !myParticipant,
    };
  });

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

/**
 * Fetches single conversation details with authorization check.
 */
export async function getConversationDetails(
  conversationId: string,
  userId: string,
  userRole: string
) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              avatar: true,
              status: true,
              showroom: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const isParticipant = conversation.participants.some((p) => p.userId === userId);
  const isSuperAdmin = userRole === "SUPER_ADMIN";

  if (!isParticipant && !isSuperAdmin) {
    throw new Error("Unauthorized to access this conversation");
  }

  // Audit administrative view
  if (isSuperAdmin && !isParticipant) {
    await db.chatAudit.create({
      data: {
        conversationId,
        actingUserId: userId,
        action: "ADMINISTRATIVE_VIEW",
        details: JSON.stringify({ note: "Super Admin accessed non-participant conversation" }),
      },
    });
  }

  return {
    ...conversation,
    isSuperAdminView: isSuperAdmin && !isParticipant,
  };
}

/** Shared by getMessages and sendMessage so both send the client the same shape. */
const MESSAGE_INCLUDE = {
  sender: {
    select: { id: true, name: true, email: true, role: true, avatar: true },
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      senderId: true,
      type: true,
      deletedAt: true,
      sender: { select: { name: true } },
    },
  },
} as const;

/** Flattens a Prisma message row (with MESSAGE_INCLUDE) into the shape the client renders. */
function formatMessageForClient(m: any) {
  const isDeleted = !!m.deletedAt;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: m.sender?.name || "System",
    senderRole: m.sender?.role || "SYSTEM",
    senderAvatar: m.sender?.avatar || null,
    type: m.type,
    content: isDeleted ? "This message was deleted." : m.content,
    attachmentUrl: isDeleted ? null : m.attachmentUrl,
    attachmentKey: isDeleted ? null : m.attachmentKey,
    attachmentName: isDeleted ? null : m.attachmentName,
    metadata: isDeleted ? null : m.metadata ? JSON.parse(m.metadata) : null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          content: m.replyTo.deletedAt ? "This message was deleted." : m.replyTo.content,
          senderName: m.replyTo.sender?.name || "User",
        }
      : null,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    createdAt: m.createdAt,
  };
}

/**
 * Fetches messages in a conversation (paginated, latest first).
 *
 * The access check and the cursor lookup run in parallel rather than serially
 * before the messages query — the previous version called the heavy
 * `getConversationDetails` (full participants/user/showroom include) purely to
 * check membership, then the cursor lookup, then the messages query: up to 3
 * serial round trips to a database ~1.5s away. A single-row membership lookup
 * run alongside the cursor lookup, followed by the messages query, cuts that
 * to at most 2.
 */
export async function getMessages(
  conversationId: string,
  userId: string,
  userRole: string,
  options: { limit?: number; beforeId?: string; search?: string }
) {
  const { limit = 50, beforeId, search } = options;

  const [participant, beforeMsg] = await Promise.all([
    db.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    }),
    beforeId
      ? db.message.findUnique({ where: { id: beforeId }, select: { createdAt: true } })
      : Promise.resolve(null),
  ]);

  const isSuperAdmin = userRole === "SUPER_ADMIN";
  if (!participant && !isSuperAdmin) {
    throw new Error("Unauthorized to access this conversation");
  }

  const whereClause: any = { conversationId };
  if (beforeMsg) {
    whereClause.createdAt = { lt: beforeMsg.createdAt };
  }
  if (search && search.trim().length > 0) {
    whereClause.content = { contains: search.trim(), mode: "insensitive" };
  }

  const messages = await db.message.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: limit + 1, // +1 to check hasMore
    include: MESSAGE_INCLUDE,
  });

  const hasMore = messages.length > limit;
  const resultMessages = hasMore ? messages.slice(0, limit) : messages;
  const formatted = resultMessages.map(formatMessageForClient);

  // Administrative (non-participant) view — fire-and-forget, must not block
  // the response the way a serial pre-check did.
  if (isSuperAdmin && !participant) {
    db.chatAudit
      .create({
        data: {
          conversationId,
          actingUserId: userId,
          action: "ADMINISTRATIVE_VIEW",
          details: JSON.stringify({ note: "Super Admin accessed non-participant conversation" }),
        },
      })
      .catch(() => {});
  }

  // Return chronologically for renderer (oldest at top, newest at bottom)
  return {
    messages: formatted.reverse(),
    hasMore,
    nextBeforeId: hasMore ? resultMessages[resultMessages.length - 1].id : null,
  };
}

/**
 * Sends a message in a conversation.
 *
 * Idempotent on `clientMessageId`: a retried send (double-click, network
 * retry, reconnect replay) reuses the same key, and this returns the row that
 * already exists instead of inserting a second one. That check — plus the
 * `client_message_id` unique index catching a same-instant race — is what
 * actually prevents duplicates; client-side dedup only hides the problem in
 * the sender's own tab.
 */
export async function sendMessage(input: SendMessageInput) {
  const {
    conversationId,
    senderId,
    type = "TEXT",
    content,
    attachmentUrl,
    attachmentKey,
    attachmentName,
    replyToId,
    metadata,
    userRole,
    clientMessageId,
  } = input;

  if (!content || content.trim().length === 0) {
    if (!attachmentUrl) {
      throw new Error("Message content or attachment is required");
    }
  }

  if (clientMessageId) {
    const existing = await db.message.findUnique({
      where: { clientMessageId },
      include: MESSAGE_INCLUDE,
    });
    if (existing) return formatMessageForClient(existing);
  }

  // Check authorization
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });

  if (!conv) throw new Error("Conversation not found");

  const isParticipant = conv.participants.some((p) => p.userId === senderId);
  if (!isParticipant && userRole !== "SUPER_ADMIN") {
    throw new Error("You are not a participant in this conversation");
  }

  const now = new Date();
  let message;
  try {
    message = await db.message.create({
      data: {
        conversationId,
        senderId,
        type,
        content: content ? content.trim() : attachmentName || "Attachment",
        attachmentUrl: attachmentUrl || null,
        attachmentKey: attachmentKey || null,
        attachmentName: attachmentName || null,
        replyToId: replyToId || null,
        metadata: metadata || null,
        clientMessageId: clientMessageId || null,
      },
      include: MESSAGE_INCLUDE,
    });
  } catch (err: any) {
    // Another request for the same clientMessageId won the unique-constraint
    // race between our pre-check and this insert — return that row.
    if (err?.code === "P2002" && clientMessageId) {
      const existing = await db.message.findUnique({ where: { clientMessageId }, include: MESSAGE_INCLUDE });
      if (existing) return formatMessageForClient(existing);
    }
    throw err;
  }

  // Conversation bump, sender's read receipt and the audit log touch
  // independent rows — running them together instead of three serial awaits
  // cuts ~2 round trips off every send on a database this far away.
  await Promise.all([
    db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, updatedAt: now },
    }),
    isParticipant
      ? db.conversationParticipant.update({
          where: { conversationId_userId: { conversationId, userId: senderId } },
          data: { lastReadAt: now },
        })
      : Promise.resolve(),
    db.chatAudit.create({
      data: {
        conversationId,
        actingUserId: senderId,
        action: "MESSAGE_SENT",
        details: JSON.stringify({ messageId: message.id, type }),
      },
    }),
  ]);

  const formatted = formatMessageForClient(message);

  // Realtime fan-out to every other participant (best-effort; Postgres remains
  // the source of truth and the client falls back to a fetch if this payload
  // never arrives). The full formatted message rides along so subscribers can
  // append it directly instead of a follow-up fetch.
  await Promise.all(
    conv.participants
      .filter((p) => p.userId !== senderId)
      .map((p) =>
        publishEvent(`user-chat:${p.userId}`, {
          action: "NEW_MESSAGE",
          conversationId,
          messageId: message.id,
          clientMessageId,
          message: formatted,
        })
      )
  );

  return formatted;
}

/**
 * Edits a message.
 */
export async function editMessage(messageId: string, userId: string, newContent: string, userRole: string) {
  const msg = await db.message.findUnique({ where: { id: messageId } });
  if (!msg) throw new Error("Message not found");

  if (msg.senderId !== userId && userRole !== "SUPER_ADMIN") {
    throw new Error("Unauthorized to edit this message");
  }

  if (msg.deletedAt) throw new Error("Cannot edit a deleted message");

  const updated = await db.message.update({
    where: { id: messageId },
    data: {
      content: newContent.trim(),
      editedAt: new Date(),
      editedById: userId,
    },
  });

  await db.chatAudit.create({
    data: {
      conversationId: msg.conversationId,
      actingUserId: userId,
      action: "MESSAGE_EDITED",
      details: JSON.stringify({ messageId }),
    },
  });

  await notifyConversationParticipants(msg.conversationId, userId, "MESSAGE_UPDATED", { messageId });

  return updated;
}

/**
 * Soft-deletes a message.
 */
export async function deleteMessage(messageId: string, userId: string, userRole: string) {
  const msg = await db.message.findUnique({ where: { id: messageId } });
  if (!msg) throw new Error("Message not found");

  if (msg.senderId !== userId && userRole !== "SUPER_ADMIN") {
    throw new Error("Unauthorized to delete this message");
  }

  const deleted = await db.message.update({
    where: { id: messageId },
    data: {
      deletedAt: new Date(),
      deletedById: userId,
    },
  });

  await db.chatAudit.create({
    data: {
      conversationId: msg.conversationId,
      actingUserId: userId,
      action: "MESSAGE_DELETED",
      details: JSON.stringify({ messageId }),
    },
  });

  await notifyConversationParticipants(msg.conversationId, userId, "MESSAGE_DELETED", { messageId });

  return deleted;
}

/** Publishes a realtime event to every participant of a conversation except the actor. */
async function notifyConversationParticipants(
  conversationId: string,
  excludeUserId: string,
  action: string,
  extra: Record<string, unknown> = {}
) {
  const participants = await db.conversationParticipant.findMany({
    where: { conversationId, userId: { not: excludeUserId } },
    select: { userId: true },
  });

  await Promise.all(
    participants.map((p) =>
      publishEvent(`user-chat:${p.userId}`, { action, conversationId, ...extra })
    )
  );
}

/**
 * Marks conversation messages as read for a user.
 */
export async function markConversationAsRead(conversationId: string, userId: string) {
  const now = new Date();
  await db.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: now },
  });
  return { success: true, lastReadAt: now };
}

/**
 * Returns total unread chat messages for a user across all active conversations.
 */
export async function getUnreadChatCount(userId: string) {
  const result = await db.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(m.id) as total
    FROM "Message" m
    JOIN "ConversationParticipant" cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ${userId}
    JOIN "Conversation" c ON c.id = m.conversation_id AND c.active = true
    WHERE m.sender_id != ${userId}
      AND m.deleted_at IS NULL
      AND m.created_at > cp.last_read_at
  `;

  return Number(result[0]?.total || 0);
}

/**
 * Returns high-level statistics for Super Admin Chat Monitor dashboard.
 */
export async function getSuperAdminChatMonitorStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalConversations,
    activeConversations,
    messagesToday,
    totalMessages,
    activeParticipantsCount,
  ] = await Promise.all([
    db.conversation.count(),
    db.conversation.count({ where: { active: true } }),
    db.message.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
    db.message.count({ where: { deletedAt: null } }),
    db.conversationParticipant.groupBy({ by: ["userId"], _count: true }),
  ]);

  return {
    totalConversations,
    activeConversations,
    messagesToday,
    totalMessages,
    activeUsersCount: activeParticipantsCount.length,
  };
}

/**
 * Global search across ALL company messages (Super Admin only).
 */
export async function searchAllMessagesSuperAdmin(query: string, limit = 30) {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim();

  const messages = await db.message.findMany({
    where: {
      deletedAt: null,
      OR: [
        { content: { contains: q, mode: "insensitive" } },
        { attachmentName: { contains: q, mode: "insensitive" } },
        { sender: { name: { contains: q, mode: "insensitive" } } },
        { conversation: { name: { contains: q, mode: "insensitive" } } },
        { conversation: { blockId: { contains: q, mode: "insensitive" } } },
        { conversation: { shipmentId: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: {
      sender: { select: { id: true, name: true, role: true, avatar: true } },
      conversation: { select: { id: true, name: true, type: true, blockId: true, shipmentId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    conversationName: m.conversation.name || (m.conversation.type === "DIRECT" ? "Direct Chat" : "Group"),
    conversationType: m.conversation.type,
    blockId: m.conversation.blockId,
    shipmentId: m.conversation.shipmentId,
    senderName: m.sender.name,
    senderRole: m.sender.role,
    content: m.content,
    createdAt: m.createdAt,
  }));
}

/**
 * Posts an automated system event message to a conversation.
 */
export async function sendSystemChatEvent(input: {
  conversationId: string;
  text: string;
  metadata?: any;
}) {
  const { conversationId, text, metadata } = input;

  // Find system or admin sender
  const adminUser = await db.user.findFirst({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    select: { id: true },
  });

  const senderId = adminUser?.id || "system";

  const message = await db.message.create({
    data: {
      conversationId,
      senderId,
      type: "SYSTEM_EVENT",
      content: text,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  await db.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), updatedAt: new Date() },
  });

  return message;
}

/**
 * Searches users for starting direct chat or adding to group.
 */
export async function searchChatUsers(query: string, currentUserId: string, limit = 20) {
  const q = (query || "").trim();

  const users = await db.user.findMany({
    where: {
      id: { not: currentUserId },
      status: "ACTIVE",
      ...(q.length > 0
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { showroom: { name: { contains: q, mode: "insensitive" } } },
              { dealer: { company: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      showroom: { select: { id: true, name: true } },
      dealer: { select: { id: true, company: true } },
    },
    orderBy: { name: "asc" },
    take: limit,
  });

  return users;
}
