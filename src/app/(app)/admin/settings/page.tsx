import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { NotificationPreferencesForm } from "@/components/notifications/NotificationPreferencesForm";

export default async function SettingsPage() {
  const session = await getSessionContext();
  if (!session.authenticated) redirect("/login");

  return (
    <>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Portal Settings</h1>
          <p className="text-xs text-[#6B6B6B]">
            Configure your B2B account profile, notification alerts, and security settings.
          </p>
        </div>

        <div className="rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-4 text-xs">
          <div className="border-b border-[#EAEAEA] pb-3">
            <h3 className="text-sm font-bold text-[#111111]">User Account Profile</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-bold text-[#6B6B6B]">Full Name</p>
              <p className="text-sm text-[#111111] mt-1 font-medium">{session.name || "N/A"}</p>
            </div>
            <div>
              <p className="font-bold text-[#6B6B6B]">Email Address</p>
              <p className="text-sm text-[#111111] mt-1 font-medium">{session.email || "N/A"}</p>
            </div>
            <div>
              <p className="font-bold text-[#6B6B6B]">Designation Role</p>
              <p className="text-sm text-[#111111] mt-1 font-bold font-mono text-[#8A7300] uppercase tracking-wide">
                {session.role?.replace(/_/g, " ")}
              </p>
            </div>
            {session.dealerId && (
              <div>
                <p className="font-bold text-[#6B6B6B]">Assigned Dealer ID</p>
                <p className="text-sm text-[#111111] mt-1 font-mono">{session.dealerId}</p>
              </div>
            )}
            {session.warehouseId && (
              <div>
                <p className="font-bold text-[#6B6B6B]">Assigned Warehouse ID</p>
                <p className="text-sm text-[#111111] mt-1 font-mono">{session.warehouseId}</p>
              </div>
            )}
          </div>
        </div>

        {/* Notification Preferences */}
        <NotificationPreferencesForm />

        <div className="rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Security Settings</h3>
            <p className="text-[11px] text-[#6B6B6B] mt-1">To change your login credentials or reset account status, contact your platform Super Admin.</p>
          </div>
        </div>
      </div>
    </>
  );
}
