import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/auth";
import { getSuperAdminChatMonitorStats, getConversationsForUser } from "@/services/ChatService";
import { AdminChatMonitorClient } from "@/components/chat/AdminChatMonitorClient";

export const metadata = {
  title: "Super Admin Chat Monitor & Audit | Prestige Inventory",
  description: "Global chat oversight, audit logs, and keyword search across company channels.",
};

export const revalidate = 0;

export default async function AdminChatPage() {
  const session = await getEffectiveSession();
  if (!session || !session.userId) {
    redirect("/login");
  }

  if (session.role !== "SUPER_ADMIN") {
    redirect("/chat");
  }

  const [stats, conversationsData] = await Promise.all([
    getSuperAdminChatMonitorStats(),
    getConversationsForUser(session.userId, {
      userRole: session.role,
      isSuperAdminView: true,
      page: 1,
      limit: 30,
    }),
  ]);

  return (
    <AdminChatMonitorClient
      session={{
        userId: session.userId,
        role: session.role,
        name: session.name,
        email: session.email,
      }}
      initialStats={stats}
      initialConversations={conversationsData.items}
    />
  );
}
