"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Plus, Pencil, Trash, X, Warehouse as WarehouseIcon, Building } from "lucide-react";
import {
  createWarehouseAction,
  updateWarehouseAction,
  deleteWarehouseAction,
} from "@/app/actions";

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  location: string | null;
  address: string | null;
  status: string;
  createdAt: string | Date;
  _count: {
    inventories: number;
    stockBlocks: number;
    shipments: number;
    users: number;
  };
}

interface Props {
  warehouses: WarehouseRow[];
  canManage: boolean;
}

const EMPTY_FORM = {
  name: "",
  code: "",
  location: "",
  address: "",
  status: "ACTIVE",
};

export function WarehousesClient({ warehouses, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  };

  const openEdit = (wh: WarehouseRow) => {
    setEditing(wh);
    setForm({
      name: wh.name,
      code: wh.code,
      location: wh.location || "",
      address: wh.address || "",
      status: wh.status || "ACTIVE",
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!form.name.trim()) {
      toast.error("Warehouse name is required.");
      return;
    }
    if (!editing && !form.code.trim()) {
      toast.error("Warehouse code is required.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await updateWarehouseAction(editing.id, {
          name: form.name,
          location: form.location || null,
          address: form.address || null,
          status: form.status,
        });

        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Warehouse updated successfully.");
      } else {
        const res = await createWarehouseAction({
          name: form.name,
          code: form.code,
          location: form.location || null,
          address: form.address || null,
          status: form.status,
        });

        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Warehouse created successfully.");
      }

      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Failed to save warehouse.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (wh: WarehouseRow) => {
    if (deletingId) return;

    const message = `Are you sure you want to delete warehouse "${wh.name}" (${wh.code})? This will permanently remove the record from the database.`;
    if (!confirm(message)) return;

    setDeletingId(wh.id);
    try {
      const res = await deleteWarehouseAction(wh.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Warehouse deleted successfully.");
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast.error(err.message || "Could not delete warehouse.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Warehouses & Depots</h1>
          <p className="text-xs text-[#6B6B6B]">
            Manage central depots, regional distribution points, and incoming shipment storage hubs.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-[#F2C202] px-3 py-2 text-xs font-black text-white hover:bg-[#D8AD02] transition-all active:scale-[0.99] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Warehouse
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[#EAEAEA] bg-[#F7F7F5] text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
            <tr>
              <th className="px-4 py-3.5">Code</th>
              <th className="px-4 py-3.5">Warehouse Name</th>
              <th className="px-4 py-3.5">Location</th>
              <th className="px-4 py-3.5">Address</th>
              <th className="px-4 py-3.5 text-center">Stock Items</th>
              <th className="px-4 py-3.5 text-center">Active Blocks</th>
              <th className="px-4 py-3.5 text-center">Incoming Shipments</th>
              <th className="px-4 py-3.5 text-center">Users</th>
              <th className="px-4 py-3.5">Status</th>
              {canManage && <th className="px-4 py-3.5 text-center">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA] font-medium text-[#111111]">
            {warehouses.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 10 : 9} className="py-12 text-center text-xs text-[#6B6B6B] italic">
                  No warehouses registered yet.
                </td>
              </tr>
            ) : (
              warehouses.map((wh) => (
                <tr key={wh.id} className="hover:bg-[#F7F7F5]/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-[10px] font-bold text-[#8A7300]">{wh.code}</td>
                  <td className="px-4 py-3 font-bold text-[#111111]">{wh.name}</td>
                  <td className="px-4 py-3 text-[#6B6B6B]">{wh.location || "—"}</td>
                  <td className="px-4 py-3 text-[#6B6B6B] max-w-[200px] truncate" title={wh.address || ""}>
                    {wh.address || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-[#111111] font-bold">{wh._count.inventories}</td>
                  <td className="px-4 py-3 text-center text-amber-600 font-bold">{wh._count.stockBlocks}</td>
                  <td className="px-4 py-3 text-center text-indigo-600 font-bold">{wh._count.shipments}</td>
                  <td className="px-4 py-3 text-center text-[#6B6B6B] font-bold">{wh._count.users}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                        wh.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-gray-100 text-gray-800 border-gray-200"
                      }`}
                    >
                      {wh.status}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEdit(wh)}
                          className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] transition-all cursor-pointer"
                          title="Edit Warehouse"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(wh)}
                          disabled={deletingId === wh.id}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all disabled:opacity-40 cursor-pointer"
                          title="Delete Warehouse"
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
          <div className="w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <div className="flex items-center gap-2">
                <WarehouseIcon className="h-5 w-5 text-[#8A7300]" />
                <h3 className="text-sm font-black uppercase text-[#111111]">
                  {editing ? `Edit Warehouse: ${editing.code}` : "Add New Warehouse"}
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
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Warehouse Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mangalore Central Depot"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Warehouse Code
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editing}
                  placeholder="e.g. WH03"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden disabled:bg-[#EAEAEA]/50 disabled:text-[#6B6B6B] disabled:cursor-not-allowed uppercase"
                />
                {!editing && (
                  <p className="text-[9px] text-[#6B6B6B]">
                    Alphanumeric (2-10 chars). Unique ID used to route shipments and track inventory.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Location (Region/City)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mangalore"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Physical Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Provide full depot address..."
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] p-2.5 text-xs text-[#111111] placeholder-[#6B6B6B] focus:border-[#F2C202] focus:outline-hidden"
                ></textarea>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                  Operating Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-[#EAEAEA] bg-white p-2.5 text-xs text-[#111111] focus:outline-hidden font-bold"
                >
                  <option value="ACTIVE">Active (Receives/Holds Stock)</option>
                  <option value="INACTIVE">Inactive (Suspended Operations)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Warehouse"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
