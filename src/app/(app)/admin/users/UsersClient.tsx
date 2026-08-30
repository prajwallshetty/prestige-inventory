"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  createUserAction,
  updateUserAction,
  deactivateUserAction,
  regenerateLoginCodeAction,
} from "@/app/actions";
import {
  Plus,
  Search,
  Edit2,
  ShieldAlert,
  KeyRound,
  Ban,
  UserCheck,
  X,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";

interface UserItem {
  id: string;
  name: string;
  email: string;
  loginCode?: string;
  role: string;
  status: string;
  warehouse_id?: string;
  showroomId?: string;
  warehouseName?: string;
  showroomName?: string;
  lastLogin: string | null;
}

interface Props {
  users: UserItem[];
  warehouses: Array<{ id: string; name: string; code: string }>;
  showrooms: Array<{ id: string; name: string }>;
}

export function UsersClient({ users, warehouses, showrooms }: Props) {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [role, setRole] = useState("SHOWROOM_STAFF");
  const [warehouseId, setWarehouseId] = useState("");
  const [showroomId, setShowroomId] = useState("");
  const [status, setStatus] = useState("ACTIVE");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    const terms = q.toLowerCase();
    return (
      u.name.toLowerCase().includes(terms) ||
      u.email.toLowerCase().includes(terms) ||
      (u.loginCode && u.loginCode.toLowerCase().includes(terms)) ||
      u.role.toLowerCase().includes(terms)
    );
  });

  const openCreateModal = () => {
    setEditingUser(null);
    setName("");
    setEmail("");
    setLoginCode("");
    setRole("SHOWROOM_STAFF");
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
    setLoginCode(u.loginCode || "");
    setRole(u.role);
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
      email: email || undefined,
      loginCode: loginCode || undefined,
      role,
      warehouse_id: role === "MANAGER" ? warehouseId : undefined,
      showroom_id: role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE" ? showroomId : undefined,
      status,
    };

    try {
      let res;
      if (editingUser) {
        res = await updateUserAction(editingUser.id, payload);
      } else {
        res = await createUserAction(payload);
      }

      if (!res.ok) {
        setError(res.error);
        setIsSubmitting(false);
        return;
      }

      setModalOpen(false);
      setIsSubmitting(false);
      toast.success(
        editingUser
          ? "User updated."
          : `User created. Login code: ${(res.data as any)?.loginCode || "Assigned"}`
      );
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message || "Operation failed. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: UserItem) => {
    if (togglingId) return;
    const targetStatus = user.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE";
    const confirmMsg = `Are you sure you want to change user status for ${user.name} to ${targetStatus}?`;
    if (!confirm(confirmMsg)) return;

    setTogglingId(user.id);
    try {
      const res = await deactivateUserAction(user.id, targetStatus as any);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${user.name} is now ${targetStatus.toLowerCase()}.`);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err?.message || "Status update failed.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleRegenerateCode = async (user: UserItem) => {
    if (regeneratingId) return;
    if (!confirm(`Regenerate login code for ${user.name}? The old code will stop working immediately.`)) {
      return;
    }

    setRegeneratingId(user.id);
    try {
      const res = await regenerateLoginCodeAction(user.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`New code generated for ${user.name}: ${res.data.loginCode}`);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err?.message || "Failed to regenerate login code.");
    } finally {
      setRegeneratingId(null);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Copied code "${code}" to clipboard.`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* FILTER & ACTIONS BAR */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Search by name, email, login code, or role..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 pl-9 pr-4 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
          />
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-[#F2C202] px-4 py-2 text-xs font-black text-white shadow-xs hover:bg-[#D8AD02] transition-all cursor-pointer min-h-[40px]"
        >
          <Plus className="h-4 w-4" /> Create User & Generate Code
        </button>
      </div>

      {/* USERS DATA TABLE — DESKTOP */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-4">User Details</th>
              <th className="px-4 py-4">Login Code</th>
              <th className="px-4 py-4">Role Designation</th>
              <th className="px-4 py-4">Linked Scope</th>
              <th className="px-4 py-4">Last Activity</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#6B6B6B] italic">
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
                    {u.loginCode ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#F2C202]/40 bg-[#F2C202]/10 px-2.5 py-1 text-xs font-black font-mono text-[#8A7300]">
                        <span>{u.loginCode}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(u.loginCode!)}
                          className="text-[#8A7300] hover:text-[#111111] p-0.5 rounded transition-all"
                          title="Copy Login Code"
                        >
                          {copiedCode === u.loginCode ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[#6B6B6B]/40 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex rounded-md bg-[#F7F7F5] border border-[#EAEAEA] px-2 py-0.5 text-[9px] font-bold text-[#6B6B6B] uppercase font-mono tracking-wide">
                      {u.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {u.role === "MANAGER" && (
                      <span className="text-indigo-600 font-bold">{u.warehouseName || "Central Warehouse"}</span>
                    )}
                    {(u.role === "SHOWROOM_STAFF" || u.role === "SHOWROOM_INCHARGE") && (
                      <span className="text-purple-600 font-bold">{u.showroomName || "Showroom Scope"}</span>
                    )}
                    {u.role !== "MANAGER" && u.role !== "SHOWROOM_STAFF" && u.role !== "SHOWROOM_INCHARGE" && (
                      <span className="text-[#6B6B6B]/40">Central All</span>
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
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleRegenerateCode(u)}
                        disabled={regeneratingId === u.id}
                        className="rounded-lg p-1.5 border border-[#EAEAEA] text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#8A7300] transition-all touch-target"
                        title="Regenerate Unique Login Code"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${regeneratingId === u.id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => openEditModal(u)}
                        className="rounded-lg p-1.5 border border-[#EAEAEA] text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all touch-target"
                        title="Edit User Config"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        disabled={togglingId === u.id}
                        className={`rounded-lg p-1.5 border border-[#EAEAEA] transition-all touch-target disabled:opacity-50 disabled:cursor-not-allowed ${
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

      {/* USERS LIST — MOBILE CARDS */}
      <div className="space-y-3 md:hidden">
        {filteredUsers.length === 0 ? (
          <div className="rounded-xl border border-[#EAEAEA] bg-white py-12 text-center text-xs italic text-[#6B6B6B]">
            No registered B2B users found.
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[#111111] truncate">{u.name}</p>
                  <p className="text-[10px] text-[#6B6B6B] font-mono mt-0.5 truncate">{u.email}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${
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
              </div>

              <div className="rounded-lg border border-[#F2C202]/30 bg-[#F2C202]/10 p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#8A7300] block">Login Code</span>
                  <span className="font-mono text-sm font-black text-[#111111]">{u.loginCode || "Unassigned"}</span>
                </div>
                {u.loginCode && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(u.loginCode!)}
                    className="flex items-center gap-1 rounded-md bg-white border border-[#EAEAEA] px-2 py-1 text-[10px] font-bold text-[#111111] shadow-2xs touch-target"
                  >
                    <Copy className="h-3 w-3 text-[#8A7300]" /> Copy
                  </button>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <dt className="text-[#6B6B6B] uppercase font-bold tracking-wide">Role</dt>
                  <dd className="mt-0.5 font-mono font-bold text-[#111111]">{u.role.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt className="text-[#6B6B6B] uppercase font-bold tracking-wide">Showroom Scope</dt>
                  <dd className="mt-0.5 font-bold">
                    {u.role === "MANAGER" ? (
                      <span className="text-indigo-600">{u.warehouseName || "Central Warehouse"}</span>
                    ) : u.role === "SHOWROOM_STAFF" || u.role === "SHOWROOM_INCHARGE" ? (
                      <span className="text-purple-600">{u.showroomName || "Showroom Scope"}</span>
                    ) : (
                      <span className="text-[#6B6B6B]/40">Central All</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="flex gap-2 border-t border-[#EAEAEA] pt-3">
                <button
                  onClick={() => handleRegenerateCode(u)}
                  disabled={regeneratingId === u.id}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#EAEAEA] text-xs font-bold text-[#8A7300] hover:bg-[#F7F7F5] touch-target"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${regeneratingId === u.id ? "animate-spin" : ""}`} /> New Code
                </button>
                <button
                  onClick={() => openEditModal(u)}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#EAEAEA] text-xs font-bold text-[#111111] hover:bg-[#F7F7F5] touch-target"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => handleToggleStatus(u)}
                  disabled={togglingId === u.id}
                  className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#EAEAEA] text-xs font-bold touch-target disabled:opacity-50 ${
                    u.status === "ACTIVE" ? "text-rose-600 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {u.status === "ACTIVE" ? <Ban className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                  {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE / EDIT DIALOG MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />

          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-lg space-y-5 text-xs text-[#111111]">
            <div className="flex justify-between items-center border-b border-[#EAEAEA] pb-3">
              <h3 className="text-sm font-bold text-[#111111]">
                {editingUser ? `Edit User Config: ${editingUser.name}` : "Create New User & Generate Code"}
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
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ansar Ahmed"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-2.5 text-xs text-[#111111] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. staff@prestigetiles.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3 py-2.5 text-xs text-[#111111] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Custom Login Code (Optional — Auto-generated if blank)
                  </label>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6B6B]" />
                  <input
                    type="text"
                    placeholder="Auto-generated e.g. SH01-ST-002"
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2.5 pl-9 pr-4 text-xs font-mono font-bold text-[#111111] uppercase focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Role Assignment</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-bold text-[#111111] focus:outline-hidden"
                  >
                    <option value="SUPER_ADMIN">SUPER ADMIN</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="SHOWROOM_INCHARGE">SHOWROOM INCHARGE</option>
                    <option value="SHOWROOM_STAFF">SHOWROOM STAFF</option>
                    <option value="WEAVER">WEAVER (Read-Only)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Account Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-bold text-[#111111] focus:outline-hidden"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DEACTIVATED">DEACTIVATED</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              {/* WAREHOUSE MAPPING FOR MANAGER */}
              {role === "MANAGER" && warehouses.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Assign Central Depot</label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden font-bold"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* SHOWROOM MAPPING FOR SHOWROOM STAFF / INCHARGE */}
              {(role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") && showrooms.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Assign Showroom (Scope 1–5)</label>
                  <select
                    value={showroomId}
                    onChange={(e) => setShowroomId(e.target.value)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden font-bold"
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
                className="w-full rounded-xl bg-[#F2C202] py-3 text-xs font-black text-white hover:bg-[#D8AD02] disabled:opacity-50 transition-all cursor-pointer min-h-[46px]"
              >
                {isSubmitting ? "Processing..." : editingUser ? "Save User Updates" : "Create User & Generate Code"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
