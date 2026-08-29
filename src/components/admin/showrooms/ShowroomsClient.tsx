"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Plus, Pencil, Trash, X, Store, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  createShowroomAction,
  updateShowroomAction,
  deleteShowroomAction,
} from "@/app/actions";

interface ShowroomRow {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  addressLine: string;
  locality: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  managerName: string | null;
  managerPhone: string | null;
  isFlagship: boolean;
  published: boolean;
  createdAt: string | Date;
  _count: {
    dealers: number;
    users: number;
    bookings: number;
  };
}

interface Props {
  showrooms: ShowroomRow[];
  canManage: boolean;
}

const EMPTY_FORM = {
  name: "",
  subtitle: "",
  addressLine: "",
  locality: "",
  city: "",
  state: "Karnataka",
  postalCode: "",
  phone: "",
  whatsapp: "",
  email: "",
  managerName: "",
  managerPhone: "",
  isFlagship: false,
  published: true,
};

export function ShowroomsClient({ showrooms, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShowroomRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  };

  const openEdit = (sh: ShowroomRow) => {
    setEditing(sh);
    setForm({
      name: sh.name,
      subtitle: sh.subtitle || "",
      addressLine: sh.addressLine,
      locality: sh.locality || "",
      city: sh.city,
      state: sh.state || "Karnataka",
      postalCode: sh.postalCode || "",
      phone: sh.phone,
      whatsapp: sh.whatsapp || "",
      email: sh.email || "",
      managerName: sh.managerName || "",
      managerPhone: sh.managerPhone || "",
      isFlagship: sh.isFlagship,
      published: sh.published,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!form.name.trim()) {
      toast.error("Showroom name is required.");
      return;
    }
    if (!form.addressLine.trim()) {
      toast.error("Address is required.");
      return;
    }
    if (!form.city.trim()) {
      toast.error("City is required.");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Phone number is required.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await updateShowroomAction(editing.id, {
          name: form.name,
          subtitle: form.subtitle || null,
          addressLine: form.addressLine,
          locality: form.locality || null,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode || null,
          phone: form.phone,
          whatsapp: form.whatsapp || null,
          email: form.email || null,
          managerName: form.managerName || null,
          managerPhone: form.managerPhone || null,
          isFlagship: form.isFlagship,
          published: form.published,
        });

        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Showroom updated successfully.");
      } else {
        const res = await createShowroomAction({
          name: form.name,
          subtitle: form.subtitle || null,
          addressLine: form.addressLine,
          locality: form.locality || null,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode || null,
          phone: form.phone,
          whatsapp: form.whatsapp || null,
          email: form.email || null,
          managerName: form.managerName || null,
          managerPhone: form.managerPhone || null,
          isFlagship: form.isFlagship,
          published: form.published,
        });

        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Showroom created successfully.");
      }

      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to save showroom.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sh: ShowroomRow) => {
    if (deletingId) return;

    const message = `Are you sure you want to delete showroom "${sh.name}"? This performs a soft delete and preserves historical associations.`;
    if (!confirm(message)) return;

    setDeletingId(sh.id);
    try {
      const res = await deleteShowroomAction(sh.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Showroom deleted successfully.");
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Could not delete showroom.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 font-sans text-xs text-[#111111]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Showroom Locations</h1>
          <p className="text-xs text-[#6B6B6B]">
            Configure and audit brand showrooms, branch contact numbers, local managers, and operating status.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-[#F2C202] px-3 py-2 text-xs font-black text-white hover:bg-[#D8AD02] transition-all active:scale-[0.99] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Showroom
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-3.5">Showroom</th>
              <th className="px-4 py-3.5">Slug / URL Path</th>
              <th className="px-4 py-3.5">Location & Address</th>
              <th className="px-4 py-3.5">Contact</th>
              <th className="px-4 py-3.5">Manager</th>
              <th className="px-4 py-3.5 text-center">Dealers</th>
              <th className="px-4 py-3.5 text-center">Staff Users</th>
              <th className="px-4 py-3.5 text-center">Bookings</th>
              <th className="px-4 py-3.5">Visibility</th>
              {canManage && <th className="px-4 py-3.5 text-center">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {showrooms.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 10 : 9} className="py-12 text-center text-xs text-[#6B6B6B] italic">
                  No showrooms registered yet.
                </td>
              </tr>
            ) : (
              showrooms.map((sh) => (
                <tr key={sh.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-[#8A7300] border border-amber-100 shrink-0">
                        <Store className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="font-bold text-[#111111]">{sh.name}</p>
                        {sh.subtitle && <p className="text-[10px] text-[#6B6B6B] mt-0.5">{sh.subtitle}</p>}
                        {sh.isFlagship && (
                          <span className="inline-flex mt-1 rounded bg-[#F2C202]/10 border border-[#F2C202]/25 px-1 py-0.5 text-[8px] font-extrabold text-[#8A7300] uppercase tracking-wide">
                            Flagship
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#6B6B6B]">{sh.slug}</td>
                  <td className="px-4 py-3">
                    <p className="text-[#111111] font-semibold">{sh.city}</p>
                    <p className="text-[10px] text-[#6B6B6B] mt-0.5 max-w-[180px] truncate" title={sh.addressLine}>
                      {sh.addressLine}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[#6B6B6B]">
                    <p className="text-[#111111] font-semibold">{sh.phone}</p>
                    {sh.email && <p className="text-[10px] lowercase mt-0.5">{sh.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-[#6B6B6B]">
                    {sh.managerName ? (
                      <>
                        <p className="text-[#111111] font-semibold">{sh.managerName}</p>
                        {sh.managerPhone && <p className="text-[10px] mt-0.5">{sh.managerPhone}</p>}
                      </>
                    ) : (
                      <span className="text-[#9A9A9A] italic">unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-indigo-600 font-bold">{sh._count.dealers}</td>
                  <td className="px-4 py-3 text-center text-[#6B6B6B] font-bold">{sh._count.users}</td>
                  <td className="px-4 py-3 text-center text-emerald-600 font-bold">{sh._count.bookings}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                        sh.published
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-gray-100 text-gray-800 border-gray-200"
                      }`}
                    >
                      {sh.published ? "Published" : "Draft"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEdit(sh)}
                          className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all cursor-pointer"
                          title="Edit Showroom"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(sh)}
                          disabled={deletingId === sh.id}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all disabled:opacity-40 cursor-pointer"
                          title="Delete Showroom"
                        >
                          <Trash className="h-3.5 w-3.5" />
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

      {/* CREATE / EDIT MODAL */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs font-sans text-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-[#8A7300]" />
                <h3 className="text-sm font-black uppercase text-[#111111]">
                  {editing ? `Edit Showroom: ${editing.name}` : "Add New Showroom"}
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Showroom Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Indiranagar Boutique"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Subtitle Descriptor
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Authorized Premium Dealer"
                    value={form.subtitle}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Street Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. #456, 100 Feet Road"
                  value={form.addressLine}
                  onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Locality
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Indiranagar"
                    value={form.locality}
                    onChange={(e) => setForm({ ...form, locality: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bengaluru"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    State
                  </label>
                  <input
                    type="text"
                    required
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 560038"
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Showroom Email
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. indiranagar@prestigetiles.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#EAEAEA] pt-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Manager Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amit Kumar"
                    value={form.managerName}
                    onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                    Manager Phone
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +91 99999 88888"
                    value={form.managerPhone}
                    onChange={(e) => setForm({ ...form, managerPhone: e.target.value })}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-[#EAEAEA] pt-4">
                <div className="flex items-center gap-2">
                  <input
                    id="isFlagship"
                    type="checkbox"
                    checked={form.isFlagship}
                    onChange={(e) => setForm({ ...form, isFlagship: e.target.checked })}
                    className="h-4 w-4 rounded border-[#EAEAEA] text-[#F2C202] focus:ring-[#F2C202]"
                  />
                  <label htmlFor="isFlagship" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider cursor-pointer">
                    Flagship Store
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="published"
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                    className="h-4 w-4 rounded border-[#EAEAEA] text-[#F2C202] focus:ring-[#F2C202]"
                  />
                  <label htmlFor="published" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider cursor-pointer">
                    Publish Online
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Showroom"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
