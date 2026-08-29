import { getInventorySummary } from "@/services/InventoryService";
import { db } from "@/lib/db";
import DashboardPage from "@/app/(app)/dashboard/page";

export const revalidate = 0;

export default async function Home() {
  return <DashboardPage />;
}
