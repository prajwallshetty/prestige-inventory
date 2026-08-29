"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Plus, Pencil, Ban, CheckCircle2, X, Building2 } from "lucide-react";
import {
  createDealerAction,
  updateDealerAction,
  setDealerStatusAction,
} from "@/app/actions";

interface DealerRow {
  id: string;
  dealerId: string | null;
  dealerCode: string | null;
  name: string;
  company: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  createdAt: string | Date;
  showroom: { id: string; name: string } | null;
  _count: { stockBlocks: number };
}

interface Props {
  dealers: DealerRow[];
  showrooms: Array<{ id: string; name: string }>;
  /** Whether the viewer may mutate. Backend enforces this too. */
  canManage: boolean;
}

const EMPTY = {
  name: "",
  dealerCode: "",
  contact: "",
  phone: "",
  email: "",
  address: "",
  company: "",
  showroomId: "",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
};

export function DealersClient({ dealers, showrooms, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DealerRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const year = new Date().getFullYear();
  const codePreview = (form.dealerCode || "").trim().toUpperCase().replace(/\s+/g, "");
  // Mirrors previewDealerId() on the server; the authoritative ID is minted
  // by the backend on submit, this is only a hint for the operator.
  const idPreview = `${year}/${codePreview || "____"}/0001`;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const openEdit = (d: DealerRow) => {
    setEditing(d);
    setForm({
      name: d.name,
      dealerCode: d.dealerCode || "",
      contact: d.contact || "",
      phone: d.phone || "",
      email: d.email || "",
      address: d.address || "",
      company: d.company || "",
      showroomId: d.showroom?.id || "",
      status: (d.status as "ACTIVE" | "INACTIVE") || "ACTIVE",
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateDealerAction(editing.id, {
          name: form.name,
          contact: form.contact,
          phone: form.phone,
          email: form.email,
          address: form.address,
          company: form.company,
          showroomId: form.showroomId || undefined,
          status: form.status,
        });
        if (!updated.ok) {
          toast.error(updated.error);
          return;
        }
        toast.success("Dealer updated.");
      } else {
        const created = await createDealerAction({
          name: form.name,
          dealerCode: form.dealerCode,
          contact: form.contact,
          phone: form.phone,
          email: form.email,
          address: form.address,
          company: form.company,
          showroomId: form.showroomId || undefined,
          status: form.status,
        });
        if (!created.ok) {
          toast.error(created.error);
          return;
        }
        toast.success(`Dealer created successfully — ${created.data.dealerId}`);
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Could not save dealer.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (d: DealerRow) => {
    if (busyId) return;
    const next = d.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (next === "INACTIVE" && !confirm(`Deactivate ${d.name}? Existing blocks are preserved.`)) return;
    setBusyId(d.id);
    try {
      const res = await setDealerStatusAction(d.id, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(next === "ACTIVE" ? "Dealer reactivated." : "Dealer deactivated.");
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Could not change dealer status.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Dealer Management</h1>
          <p className="text-xs text-[#6B6B6B]">
            Registered dealers, generated dealer IDs, and reservation history.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-[#F2C202] px-3 py-2 text-xs font-black text-white hover:bg-[#D8AD02] transition-all active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" /> New Dealer
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-3.5">Dealer ID</th>
              <th className="px-4 py-3.5">Code</th>
              <th className="px-4 py-3.5">Dealer Name</th>
              <th className="px-4 py-3.5">Contact</th>
              <th className="px-4 py-3.5">Showroom</th>
              <th className="px-4 py-3.5 text-right">Blocks</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Created</th>
              {canManage && <th className="px-4 py-3.5 text-center">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {dealers.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 9 : 8} className="py-12 text-center text-xs text-[#6B6B6B] italic">
                  No dealers registered yet.
                </td>
              </tr>
            ) : (
              dealers.map((d) => (
                <tr key={d.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-[11px] font-bold text-[#8A7300]">
                    {d.dealerId || <span className="text-[#9A9A9A] italic">not assigned</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#6B6B6B]">{d.dealerCode || "—"}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{d.name}</p>
                    {d.company && <p className="text-[10px] text-[#6B6B6B]">{d.company}</p>}
                  </td>
                  <td className="px-4 py-3 text-[#6B6B6B]">
                    {d.contact && <p className="text-[#111111]">{d.contact}</p>}
                    {d.phone && <p className="text-[10px]">{d.phone}</p>}
                    {d.email && <p className="text-[10px] truncate max-w-[180px]">{d.email}</p>}
                    {!d.contact && !d.phone && !d.email && "—"}
                  </td>
                  <td className="px-4 py-3 text-[#6B6B6B]">{d.showroom?.name || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{d._count.stockBlocks}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                        d.status === "ACTIVE"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-[#EAEAEA] bg-[#F7F7F5] text-[#9A9A9A]"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-[#6B6B6B]">
                    {new Date(d.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEdit(d)}
                          className="rounded-lg border border-[#EAEAEA] p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all"
                          title="Edit dealer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleStatus(d)}
                          disabled={busyId === d.id}
                          aria-busy={busyId === d.id}
                          className={`rounded-lg border p-1.5 transition-all disabled:opacity-50 ${
                            d.status === "ACTIVE"
                              ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                          title={d.status === "ACTIVE" ? "Deactivate dealer" : "Reactivate dealer"}
                        >
                          {d.status === "ACTIVE" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT DIALOG */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3 mb-4">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase text-[#111111]">
                <Building2 className="h-4 w-4 text-[#F2C202]" />
                {editing ? "Edit Dealer" : "New Dealer"}
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="dealer-name" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Dealer Name *
                </label>
                <input
                  id="dealer-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:outline-hidden focus:border-[#F2C202]"
                />
              </div>

              {!editing && (
                <div className="space-y-1">
                  <label htmlFor="dealer-code" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Dealer Code *
                  </label>
                  <input
                    id="dealer-code"
                    required
                    value={form.dealerCode}
                    onChange={(e) => setForm({ ...form, dealerCode: e.target.value })}
                    placeholder="PR1"
                    maxLength={6}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs font-mono uppercase focus:outline-hidden focus:border-[#F2C202]"
                  />
                  <div className="flex items-center gap-2 rounded-lg bg-[#F7F7F5] border border-[#EAEAEA] px-3 py-2">
                    <span className="text-[9px] font-black uppercase text-[#6B6B6B]">Dealer ID preview</span>
                    <span className="font-mono text-xs font-bold text-[#8A7300]">{idPreview}</span>
                  </div>
                  <p className="text-[9px] text-[#9A9A9A]">
                    2-6 letters or digits. The final ID is generated by the server on save.
                  </p>
                </div>
              )}

              {editing && (
                <div className="rounded-lg bg-[#F7F7F5] border border-[#EAEAEA] px-3 py-2">
                  <span className="text-[9px] font-black uppercase text-[#6B6B6B]">Dealer ID</span>
                  <p className="font-mono text-xs font-bold text-[#8A7300]">{editing.dealerId || "not assigned"}</p>
                  <p className="text-[9px] text-[#9A9A9A] mt-1">
                    The ID and code are fixed once assigned — blocks reference them.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="dealer-contact" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Contact Person
                  </label>
                  <input
                    id="dealer-contact"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:outline-hidden focus:border-[#F2C202]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="dealer-phone" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Phone
                  </label>
                  <input
                    id="dealer-phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:outline-hidden focus:border-[#F2C202]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="dealer-email" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Email
                </label>
                <input
                  id="dealer-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:outline-hidden focus:border-[#F2C202]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="dealer-address" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Address
                </label>
                <textarea
                  id="dealer-address"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:outline-hidden focus:border-[#F2C202]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="dealer-showroom" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Showroom
                  </label>
                  <select
                    id="dealer-showroom"
                    value={form.showroomId}
                    onChange={(e) => setForm({ ...form, showroomId: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:outline-hidden focus:border-[#F2C202]"
                  >
                    <option value="">Unassigned</option>
                    {showrooms.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="dealer-status" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Status
                  </label>
                  <select
                    id="dealer-status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as "ACTIVE" | "INACTIVE" })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs focus:outline-hidden focus:border-[#F2C202]"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  aria-busy={saving}
                  className="flex-1 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (editing ? "Saving..." : "Creating...") : editing ? "Save Changes" : "Create Dealer"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[#EAEAEA] bg-white px-4 py-2.5 text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F7F5] transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
