"use client";

import React, { useState } from "react";
import { createUserAction, updateUserAction, deactivateUserAction } from "@/app/actions";
import { Plus, Search, Edit2, ShieldAlert, KeyRound, Ban, UserCheck, X } from "lucide-react";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  dealer_id?: string;
  warehouse_id?: string;
  showroomId?: string;
  dealerName?: string;
  warehouseName?: string;
  showroomName?: string;
  lastLogin: string | null;
}

interface Props {
  users: UserItem[];
  dealers: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; code: string }>;
  showrooms: Array<{ id: string; name: string }>;
}

export function UsersClient({ users, dealers, warehouses, showrooms }: Props) {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("WEAVER");
  const [dealerId, setDealerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [showroomId, setShowroomId] = useState("");
  const [status, setStatus] = useState("ACTIVE");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    const terms = q.toLowerCase();
    return (
      u.name.toLowerCase().includes(terms) ||
      u.email.toLowerCase().includes(terms) ||
      u.role.toLowerCase().includes(terms)
    );
  });

  const openCreateModal = () => {
    setEditingUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("WEAVER");
    setDealerId(dealers[0]?.id || "");
    setWarehouseId(warehouses[0]?.id || "");
    setShowroomId(showrooms[0]?.id || "");
    setStatus("ACTIVE");
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (u: UserItem) => {
    setEditingUser(u);
    setName(u.name);
    setEmail(u.email);
    setPassword(""); // Clear password field
    setRole(u.role);
    setDealerId(u.dealer_id || dealers[0]?.id || "");
    setWarehouseId(u.warehouse_id || warehouses[0]?.id || "");
    setShowroomId(u.showroomId || showrooms[0]?.id || "");
    setStatus(u.status);
    setError(null);
    setModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const payload = {
      name,
      email,
      password: password || undefined,
      role,
      dealer_id: undefined, // DEALER role retired in Phase 1
      warehouse_id: role === "MANAGER" ? warehouseId : undefined,
      showroom_id: (role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") ? showroomId : undefined,
      status,
    };

    try {
      if (editingUser) {
        await updateUserAction(editingUser.id, payload);
      } else {
        if (!password) {
          throw new Error("Password is required for new users.");
        }
        await createUserAction(payload);
      }
      setModalOpen(false);
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "Operation failed.");
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: UserItem) => {
    const targetStatus = user.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE";
    const confirmMsg = `Are you sure you want to change user status for ${user.name} to ${targetStatus}?`;
    if (!confirm(confirmMsg)) return;

    try {
      await deactivateUserAction(user.id, targetStatus as any);
      window.location.reload();
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* FILTER & ACTIONS BAR */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 pl-9 pr-4 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
          />
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-[#F2C202] px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-[#D8AD02] transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Create User
        </button>
      </div>

      {/* USERS DATA TABLE */}
      <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-4">User Details</th>
              <th className="px-4 py-4">Role Designation</th>
              <th className="px-4 py-4">Linked Context</th>
              <th className="px-4 py-4">Last Activity</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-xs text-[#6B6B6B] italic">
                  No registered B2B users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-[#111111]">{u.name}</p>
                    <p className="text-[10px] text-[#6B6B6B] font-mono mt-0.5">{u.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex rounded-md bg-[#F7F7F5] border border-[#EAEAEA] px-2 py-0.5 text-[9px] font-bold text-[#6B6B6B] uppercase font-mono tracking-wide">
                      {u.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {false && (
                      <span className="text-[#8A7300] font-bold">{u.dealerName || "Dealer Scope"}</span>
                    )}
                    {u.role === "MANAGER" && (
                      <span className="text-indigo-600 font-bold">{u.warehouseName || "Depot Manager"}</span>
                    )}
                    {(u.role === "SHOWROOM_STAFF" || u.role === "SHOWROOM_INCHARGE") && (
                      <span className="text-purple-600 font-bold">{u.showroomName || "Showroom Origin"}</span>
                    )}
                    {u.role !== "MANAGER" && u.role !== "SHOWROOM_STAFF" && u.role !== "SHOWROOM_INCHARGE" && (
                      <span className="text-[#6B6B6B]/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-[#6B6B6B]">
                    {u.lastLogin
                      ? new Date(u.lastLogin).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never active"}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${
                        u.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : u.status === "SUSPENDED"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : "bg-[#F7F7F5] text-[#6B6B6B] border-[#EAEAEA]"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(u)}
                        className="rounded-lg p-1.5 border border-[#EAEAEA] text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all touch-target"
                        title="Edit User Config"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`rounded-lg p-1.5 border border-[#EAEAEA] transition-all touch-target ${
                          u.status === "ACTIVE"
                            ? "text-rose-600 hover:bg-rose-50"
                            : "text-emerald-600 hover:bg-emerald-50"
                        }`}
                        title={u.status === "ACTIVE" ? "Deactivate Account" : "Activate Account"}
                      >
                        {u.status === "ACTIVE" ? <Ban className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT DIALOG MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />

          <div className="relative w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-lg space-y-5 text-xs text-[#111111]">
            <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-3">
              <h3 className="text-sm font-bold text-[#111111]">
                {editingUser ? `Edit User Config: ${editingUser.name}` : "Create New B2B Portal User"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-[#6B6B6B] hover:text-[#111111]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 flex gap-2 text-rose-800 font-bold">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prajwal Shetty"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-2 text-xs text-[#111111] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. user@prestigetiles.co"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-2 text-xs text-[#111111] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  {editingUser ? "Reset Password (Leave blank to keep)" : "Password"}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6B6B]" />
                  <input
                    type="password"
                    required={!editingUser}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 pl-9 pr-4 text-xs text-[#111111] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Role Assignment</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:outline-hidden"
                  >
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="MANAGER">Manager</option>
                    <option value="SHOWROOM_INCHARGE">Showroom In-Charge</option>
                    <option value="SHOWROOM_STAFF">Showroom Staff</option>
                    <option value="WEAVER">Weaver (Read-Only)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">User Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:outline-hidden"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DEACTIVATED">DEACTIVATED</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              {/* DEALER SPECIFIC MAPPING */}
              {false && dealers.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Assign Dealer Partner</label>
                  <select
                    value={dealerId}
                    onChange={(e) => setDealerId(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:outline-hidden font-bold"
                  >
                    {dealers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* WAREHOUSE SPECIFIC MAPPING */}
              {role === "MANAGER" && warehouses.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Assign Primary Depot</label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:outline-hidden font-bold"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* SHOWROOM SPECIFIC MAPPING */}
              {(role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") && showrooms.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Assign Showroom Origin</label>
                  <select
                    value={showroomId}
                    onChange={(e) => setShowroomId(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2 text-xs text-[#111111] focus:outline-hidden font-bold"
                  >
                    {showrooms.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSubmitting ? "Processing..." : editingUser ? "Save Updates" : "Create Account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
