"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Lock,
  Truck,
  Users,
  Warehouse as WarehouseIcon,
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
  Sliders,
  Store,
  UserCheck,
  Download,
  Smartphone,
  CircleUser
} from "lucide-react";
import { getDealersAndWarehousesAction, setSimulatedSessionAction } from "@/app/actions";

export type UserRole = "SUPER_ADMIN" | "WAREHOUSE_MANAGER" | "DEALER" | "VIEWER";

interface DealerInfo {
  id: string;
  name: string;
}

interface WarehouseInfo {
  id: string;
  name: string;
  code: string;
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Simulated Session State
  const [role, setRole] = useState<UserRole>("SUPER_ADMIN");
  const [dealerId, setDealerId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");

  // Options
  const [dealers, setDealers] = useState<DealerInfo[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    // Check if PWA install banner was dismissed
    const isDismissed = localStorage.getItem("prestige_pwa_dismissed") === "true";

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Parse cookies on mount
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(";").shift();
      return undefined;
    };

    const cookieRole = (getCookie("prestige_role") as UserRole) || "SUPER_ADMIN";
    const cookieDealerId = getCookie("prestige_dealer_id") || "";
    const cookieWarehouseId = getCookie("prestige_warehouse_id") || "";

    setRole(cookieRole);
    setDealerId(cookieDealerId);
    setWarehouseId(cookieWarehouseId);

    // Fetch lists
    getDealersAndWarehousesAction().then(({ dealers, warehouses }) => {
      setDealers(dealers);
      setWarehouses(warehouses);
      
      let newDealer = cookieDealerId;
      let newWarehouse = cookieWarehouseId;
      
      if (!cookieDealerId && dealers.length > 0) {
        newDealer = dealers[0].id;
        setDealerId(dealers[0].id);
      }
      if (!cookieWarehouseId && warehouses.length > 0) {
        newWarehouse = warehouses[0].id;
        setWarehouseId(warehouses[0].id);
      }

      if (!cookieDealerId || !cookieWarehouseId) {
        setSimulatedSessionAction(cookieRole, newDealer, newWarehouse);
      }

      setLoading(false);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismissInstall = () => {
    localStorage.setItem("prestige_pwa_dismissed", "true");
    setShowInstallBanner(false);
  };

  const handleRoleChange = async (newRole: UserRole) => {
    setRole(newRole);
    const dId = newRole === "DEALER" ? (dealerId || dealers[0]?.id || "") : "";
    const wId = newRole === "WAREHOUSE_MANAGER" ? (warehouseId || warehouses[0]?.id || "") : "";
    await setSimulatedSessionAction(newRole, dId, wId);
    window.location.reload();
  };

  const handleDealerChange = async (newDealerId: string) => {
    setDealerId(newDealerId);
    await setSimulatedSessionAction(role, newDealerId, warehouseId);
    window.location.reload();
  };

  const handleWarehouseChange = async (newWarehouseId: string) => {
    setWarehouseId(newWarehouseId);
    await setSimulatedSessionAction(role, dealerId, newWarehouseId);
    window.location.reload();
  };

  const triggerSearch = () => {
    // Dispatch Command palette keyboard shortcut
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    window.dispatchEvent(event);
  };

  // Generate links
  const getNavItems = () => {
    const dashboard = { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard };
    const stockBooking = { name: "Book Stock", href: "/bookings/new", icon: Store };
    const myBookings = { name: "My Bookings", href: "/bookings", icon: FileSpreadsheet };
    const bookingsQueue = { name: "Booking Queue", href: "/bookings", icon: FileSpreadsheet };
    const allStock = { name: "All Stock", href: "/inventory", icon: Boxes };
    const lowStock = { name: "Low Stock Alert", href: "/inventory?status=LOW_STOCK", icon: AlertTriangle };
    const outOfStock = { name: "Out of Stock", href: "/inventory?status=OUT_OF_STOCK", icon: PackageCheck };
    const dealerBlocks = { name: "Dealer Blocks", href: "/blocks", icon: Lock };
    const shipments = { name: "Shipments & Transit", href: "/in-transit", icon: Truck };
    const dealersMgmt = { name: "Dealers", href: "/dealers", icon: Users };
    const warehousesMgmt = { name: "Warehouses", href: "/warehouses", icon: WarehouseIcon };
    const reports = { name: "Reports & Export", href: "/reports", icon: FileSpreadsheet };
    const audit = { name: "Audit Trail", href: "/system/audit", icon: ShieldCheck };

    if (role === "DEALER") {
      return [
        {
          category: "DEALER PORTAL",
          items: [dashboard, stockBooking, myBookings, allStock],
        },
        {
          category: "ANALYTICS",
          items: [reports],
        }
      ];
    }

    if (role === "WAREHOUSE_MANAGER") {
      return [
        {
          category: "OVERVIEW",
          items: [dashboard],
        },
        {
          category: "INVENTORY CONTROL",
          items: [allStock, lowStock, outOfStock],
        },
        {
          category: "RESERVATIONS & LOGISTICS",
          items: [bookingsQueue, shipments, dealerBlocks],
        },
        {
          category: "REPORTING",
          items: [reports],
        }
      ];
    }

    return [
      {
        category: "OVERVIEW",
        items: [dashboard],
      },
      {
        category: "INVENTORY CONTROL",
        items: [allStock, lowStock, outOfStock],
      },
      {
        category: "STOCK RESERVATION",
        items: [bookingsQueue, dealerBlocks],
      },
      {
        category: "LOGISTICS & TRANSIT",
        items: [shipments],
      },
      {
        category: "MANAGEMENT",
        items: [dealersMgmt, warehousesMgmt, reports, audit],
      },
    ];
  };

  const navGroups = getNavItems();
  const currentDealerName = dealers.find(d => d.id === dealerId)?.name || "Select Dealer";
  const currentWarehouseName = warehouses.find(w => w.id === warehouseId)?.name || "Select Warehouse";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050811] text-slate-200 antialiased font-sans">
      {/* MOBILE BACKDROP FOR Hamburger drawer */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* DESKTOP SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#1b253b]/45 bg-[#090e1a] transition-all duration-200 lg:static lg:z-auto ${
          mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-[72px]" : "lg:w-64"}`}
      >
        {/* BRAND LOGO */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#1b253b]/45 px-4 bg-[#080c16]">
          {(!collapsed || mobileOpen) ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 font-black text-slate-950 shadow-md">
                PT
              </div>
              <div className="flex flex-col">
                <h1 className="text-xs font-black tracking-wider text-white uppercase">PRESTIGE TILES</h1>
                <p className="text-[9px] font-bold text-amber-500 tracking-widest">ENTERPRISE ERP</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 font-bold text-slate-950">
              PT
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-lg p-1 text-slate-400 hover:bg-slate-800/80 hover:text-white lg:flex"
              title={collapsed ? "Expand panel" : "Collapse panel"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/80 hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION WRAPPER */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {(!collapsed || mobileOpen) && (
                <p className="px-3 pb-1 text-[9px] font-black tracking-widest text-slate-500 uppercase">
                  {group.category}
                </p>
              )}
              <div className="space-y-0.5">
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
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 active-nav-indicator"
                          : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                      }`}
                      title={collapsed && !mobileOpen ? item.name : undefined}
                    >
                      <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-amber-400" : "text-slate-400"}`} />
                      {(!collapsed || mobileOpen) && <span className="truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* SIMULATED CONTEXT FOOTER */}
        <div className="shrink-0 border-t border-[#1b253b]/45 p-3 space-y-2.5 bg-[#060a13]">
          {(!collapsed || mobileOpen) ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">
                <Sliders className="h-3 w-3 text-amber-500" />
                <span>Simulate Context</span>
              </div>
              
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                className="w-full rounded-lg border border-[#1b253b]/50 bg-slate-950 p-1.5 text-xs text-white focus:border-amber-500 focus:outline-hidden"
              >
                <option value="SUPER_ADMIN">Super Admin (Master)</option>
                <option value="WAREHOUSE_MANAGER">Warehouse Manager</option>
                <option value="DEALER">Dealer Profile</option>
                <option value="VIEWER">Auditor (Read Only)</option>
              </select>

              {role === "DEALER" && dealers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Active Dealer</p>
                  <select
                    value={dealerId}
                    onChange={(e) => handleDealerChange(e.target.value)}
                    className="w-full rounded-lg border border-[#1b253b]/50 bg-slate-950 p-1.5 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                  >
                    {dealers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {role === "WAREHOUSE_MANAGER" && warehouses.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Depot Context</p>
                  <select
                    value={warehouseId}
                    onChange={(e) => handleWarehouseChange(e.target.value)}
                    className="w-full rounded-lg border border-[#1b253b]/50 bg-slate-950 p-1.5 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={() => setCollapsed(false)}
                className="rounded-lg p-2 bg-slate-900 border border-slate-800 text-amber-500 hover:text-amber-400"
                title="Expand Simulator"
              >
                <Sliders className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* CONTENT INNER CONTAINER */}
      <div className="flex flex-1 flex-col overflow-hidden pb-16 lg:pb-0">
        {/* PWA INSTALL BANNER */}
        {showInstallBanner && (
          <div className="flex items-center justify-between gap-4 bg-slate-900 border-b border-[#1b253b]/60 px-4 py-2.5 sm:px-6 animate-shimmer">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-amber-500 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-white">Install Prestige Inventory</span>
                <span className="hidden sm:inline text-slate-350 ml-1.5">Access dashboard and reserves faster on home screen.</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="rounded-lg bg-amber-500 px-3 py-1 text-[10px] font-black text-slate-950 hover:bg-amber-400 transition-all"
              >
                Install
              </button>
              <button
                onClick={handleDismissInstall}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* HEADER / TOPBAR */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#1b253b]/45 bg-[#070b17] px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Hamburger for Non-dealer mobile menu */}
            {role !== "DEALER" && (
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-lg border border-slate-800 bg-slate-900/90 p-2 text-slate-400 hover:text-white lg:hidden touch-target"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            {/* Clickable Search input triggering palette */}
            <button
              onClick={triggerSearch}
              className="flex items-center gap-3 rounded-lg border border-[#1b253b]/40 bg-slate-900/60 py-1.5 px-3 w-48 sm:w-80 text-left text-xs text-slate-450 hover:border-slate-700 transition-all touch-target"
            >
              <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span className="truncate flex-1 text-slate-500">Search (⌘K or /)</span>
              <kbd className="hidden sm:inline-block rounded bg-slate-950 border border-slate-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-slate-500">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Context Badge */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black text-amber-400 uppercase tracking-wide">
              <UserCheck className="h-3 w-3 shrink-0" />
              <span>
                {role === "SUPER_ADMIN" && "Super Admin"}
                {role === "VIEWER" && "Read-Only"}
                {role === "WAREHOUSE_MANAGER" && `Manager @ ${currentWarehouseName.split(" ")[0]}`}
                {role === "DEALER" && `${currentDealerName}`}
              </span>
            </div>

            {/* Notification Indicator */}
            <button className="relative rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:text-slate-200 touch-target">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
            </button>
          </div>
        </header>

        {/* CONTAINER CONTENT */}
        <main className="flex-1 overflow-y-auto bg-[#050812] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR FOR DEALER */}
      {role === "DEALER" && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-[#1b253b]/65 bg-[#090e1af2] backdrop-blur-md px-2 lg:hidden mobile-bottom-nav">
          <BottomTabLink href="/dashboard" icon={LayoutDashboard} label="Home" active={pathname === "/dashboard"} />
          <BottomTabLink href="/inventory" icon={Boxes} label="Products" active={pathname === "/inventory"} />
          <BottomTabLink href="/bookings/new" icon={Store} label="Book" active={pathname === "/bookings/new"} />
          <BottomTabLink href="/bookings" icon={FileSpreadsheet} label="Bookings" active={pathname === "/bookings"} />
          <BottomTabLink href="/reports" icon={Download} label="Reports" active={pathname === "/reports"} />
        </nav>
      )}
    </div>
  );
}

function BottomTabLink({ href, icon: Icon, label, active }: { href: string; icon: any; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-bold ${
        active ? "text-amber-400" : "text-slate-400"
      }`}
    >
      <Icon className={`h-5 w-5 ${active ? "text-amber-400" : "text-slate-400"}`} />
      <span>{label}</span>
    </Link>
  );
}
