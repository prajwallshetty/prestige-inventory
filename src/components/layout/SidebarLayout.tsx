"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Lock,
  Truck,
  Users,
  Warehouse,
  FileSpreadsheet,
  ShieldCheck,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  AlertTriangle,
  Menu,
  X,
  LogOut,
  SlidersHorizontal,
} from "lucide-react";

const navigationItems = [
  {
    category: "OVERVIEW",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    category: "INVENTORY CONTROL",
    items: [
      { name: "All Stock", href: "/inventory", icon: Boxes },
      { name: "Low Stock Alert", href: "/inventory?status=LOW_STOCK", icon: AlertTriangle },
      { name: "Out of Stock", href: "/inventory?status=OUT_OF_STOCK", icon: PackageCheck },
    ],
  },
  {
    category: "STOCK RESERVATION",
    items: [
      { name: "Dealer Blocks", href: "/blocks", icon: Lock },
      { name: "Expiring Blocks", href: "/blocks?status=EXPIRING", icon: Bell },
    ],
  },
  {
    category: "LOGISTICS & TRANSIT",
    items: [{ name: "Shipments & Transit", href: "/in-transit", icon: Truck }],
  },
  {
    category: "MANAGEMENT",
    items: [
      { name: "Dealers", href: "/dealers", icon: Users },
      { name: "Warehouses", href: "/warehouses", icon: Warehouse },
      { name: "Reports & Export", href: "/reports", icon: FileSpreadsheet },
      { name: "Audit Trail", href: "/system/audit", icon: ShieldCheck },
    ],
  },
];

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080C14] text-slate-100 antialiased font-sans">
      {/* MOBILE BACKDROP */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/80 bg-[#080C14] transition-all duration-300 lg:static lg:z-auto ${
          mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        {/* BRAND HEADER */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-4">
          {(!collapsed || mobileOpen) && (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 font-bold text-slate-950 shadow-md shadow-amber-500/20">
                PT
              </div>
              <div className="flex flex-col">
                <h1 className="text-xs font-black tracking-widest text-white uppercase">PRESTIGE TILES</h1>
                <p className="text-[10px] font-semibold text-amber-400/90 tracking-wide">INVENTORY CONTROL</p>
              </div>
            </div>
          )}

          {collapsed && !mobileOpen && (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 font-bold text-slate-950 shadow-md shadow-amber-500/20">
              PT
            </div>
          )}

          <div className="flex items-center gap-1">
            {/* Desktop collapse toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-white lg:flex"
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            {/* Mobile close toggle */}
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION ITEMS */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
          {navigationItems.map((group, idx) => (
            <div key={idx} className="space-y-1.5">
              {(!collapsed || mobileOpen) && (
                <p className="px-3 pb-1 text-[10px] font-bold tracking-widest text-slate-500 uppercase">
                  {group.category}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-xs font-semibold transition-all ${
                        isActive
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-xs"
                          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                      }`}
                      title={collapsed && !mobileOpen ? item.name : undefined}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-amber-400" : "text-slate-400"}`} />
                      {(!collapsed || mobileOpen) && <span className="truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* USER PROFILE FOOTER */}
        <div className="shrink-0 border-t border-slate-800/80 p-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-900/80 p-2.5 border border-slate-800/60">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs border border-amber-500/30">
                IM
              </div>
              {(!collapsed || mobileOpen) && (
                <div className="truncate">
                  <p className="text-xs font-semibold text-white truncate">Inventory Manager</p>
                  <p className="text-[10px] text-slate-400 truncate">admin@prestigetiles.com</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN LAYOUT WRAPPER */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* TOP HEADER */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#0c101c]/90 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Mobile menu hamburger button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Global Search Bar */}
            <div className="relative w-64 sm:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search SKU, tile name, brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/90 py-2 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* STATUS BADGES & NOTIFICATIONS */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Central Depot Connected
            </div>

            <button className="relative rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500"></span>
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto bg-[#080C14] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
