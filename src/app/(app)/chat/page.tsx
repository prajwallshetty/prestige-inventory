import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/auth";
import { getConversationsForUser } from "@/services/ChatService";
import { ChatClient } from "@/components/chat/ChatClient";

export const metadata = {
  title: "Internal Chat & Communication | Prestige Inventory",
  description: "Internal team communication channel for Prestige Tiles inventory management.",
};

export const revalidate = 0;

export default async function ChatPage() {
  const session = await getEffectiveSession();
  if (!session || !session.userId) {
    redirect("/login");
  }

  const conversationsData = await getConversationsForUser(session.userId, {
    userRole: session.role,
    page: 1,
    limit: 30,
  });

  return (
    <ChatClient
      session={{
        userId: session.userId,
        role: session.role,
        name: session.name,
        email: session.email,
      }}
      initialConversations={conversationsData.items}
    />
  );
}
