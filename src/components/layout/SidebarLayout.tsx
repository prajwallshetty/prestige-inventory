"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  CheckCircle,
  Menu,
  X,
  Sliders,
  Store,
  UserCheck,
  Download,
  Smartphone,
  LogOut,
  User as UserIcon,
  Settings,
  Megaphone
} from "lucide-react";
import { setSimulatedSessionAction, signOutAction } from "@/app/actions";
import { toast } from "sonner";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export type UserRole = "SUPER_ADMIN" | "MANAGER" | "VIEWER" | "SHOWROOM_INCHARGE" | "SHOWROOM_STAFF" | "DEALER";

interface Props {
  children: React.ReactNode;
  /** Fetched server-side by AppShell so the chrome never blocks on a client round trip. */
  session: any;
  dealers: any[];
  warehouses: any[];
  showrooms: any[];
}

export function SidebarLayout({ children, session, dealers, warehouses, showrooms }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Preview-simulator selections. Seeded from the server session; the change
  // handlers reload the page, so these only need to hold the pending choice.
  const activeRole: UserRole =
    session?.role === "SUPER_ADMIN" && session?.previewRole ? session.previewRole : session?.role || "VIEWER";
  const [role, setRole] = useState<UserRole>(activeRole);
  const [dealerId, setDealerId] = useState(session?.dealerId || "");
  const [warehouseId, setWarehouseId] = useState(session?.warehouseId || "");
  const [showroomId, setShowroomId] = useState(session?.showroomId || "");
  const [isOnline, setIsOnline] = useState(true);

  // Nav item awaiting route commit — drives the instant active/spinner state.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Profile dropdown open state
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // PWA install states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    // Service Worker registration
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("[SW] Registeredscope: ", reg.scope))
        .catch((err) => console.error("[SW] Registration error: ", err));
    }

    // Connectivity checks
    setIsOnline(navigator.onLine);
    const handleOnlineStatus = () => {
      setIsOnline(true);
      toast.success("Connection restored");
      router.refresh();
    };
    const handleOfflineStatus = () => {
      setIsOnline(false);
    };
    window.addEventListener("online", handleOnlineStatus);
    window.addEventListener("offline", handleOfflineStatus);

    // Dismiss/Install handler
    const isDismissed = localStorage.getItem("prestige_pwa_dismissed") === "true";
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Click outside dropdown listener
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("online", handleOnlineStatus);
      window.removeEventListener("offline", handleOfflineStatus);
    };
  }, []);

  // Route committed (or the user navigated elsewhere) — drop the pending mark.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

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
    if (!navigator.onLine) {
      alert("You're offline. Reconnect to continue.");
      return;
    }
    setRole(newRole);
    const dId = newRole === "DEALER" ? (dealerId || dealers[0]?.id || "") : "";
    const wId = newRole === "MANAGER" ? (warehouseId || warehouses[0]?.id || "") : "";
    const sId = (newRole === "SHOWROOM_STAFF" || newRole === "SHOWROOM_INCHARGE") ? (showroomId || showrooms[0]?.id || "") : "";
    
    try {
      await setSimulatedSessionAction(newRole, dId, wId, sId);
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDealerChange = async (newDealerId: string) => {
    if (!navigator.onLine) {
      alert("You're offline. Reconnect to continue.");
      return;
    }
    setDealerId(newDealerId);
    try {
      await setSimulatedSessionAction(role, newDealerId, "", "");
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleWarehouseChange = async (newWarehouseId: string) => {
    if (!navigator.onLine) {
      alert("You're offline. Reconnect to continue.");
      return;
    }
    setWarehouseId(newWarehouseId);
    try {
      await setSimulatedSessionAction(role, "", newWarehouseId, "");
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleShowroomChange = async (newShowroomId: string) => {
    if (!navigator.onLine) {
      alert("You're offline. Reconnect to continue.");
      return;
    }
    setShowroomId(newShowroomId);
    try {
      await setSimulatedSessionAction(role, "", "", newShowroomId);
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutAction();
      router.push("/login");
      router.refresh();
    } catch (err: any) {
      alert(`Logout error: ${err.message}`);
    }
  };

  const triggerSearch = () => {
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    window.dispatchEvent(event);
  };

  // Determine path prefix based on ACTUAL authenticated role
  const actualRole = session?.role || "VIEWER";
  const pathPrefix = actualRole === "SUPER_ADMIN" ? "/admin" 
    : actualRole === "MANAGER" ? "/warehouse" 
    : actualRole === "DEALER" ? "/dealer" 
    : actualRole === "SHOWROOM_STAFF" ? "/showroom-staff"
    : actualRole === "SHOWROOM_INCHARGE" ? "/showroom-incharge"
    : "/viewer";

  const getNavItems = () => {
    const dashboard = { name: "Dashboard", href: `${pathPrefix}/dashboard`, icon: LayoutDashboard };
    const allStock = { name: "All Stock", href: `${pathPrefix}/inventory`, icon: Boxes };
    
    // Role-specific routing configuration
    if (role === "DEALER") {
      const stockBooking = { name: "Book Stock", href: `${pathPrefix}/blocks/new`, icon: Store };
      const myBookings = { name: "My Bookings", href: `${pathPrefix}/bookings`, icon: FileSpreadsheet };
      const reports = { name: "Reports & Export", href: `${pathPrefix}/reports`, icon: FileSpreadsheet };
      const settings = { name: "Settings", href: `${pathPrefix}/settings`, icon: Settings };
      
      return [
        {
          category: "DEALER PORTAL",
          items: [dashboard, stockBooking, myBookings, allStock],
        },
        {
          category: "ANALYTICS & CONTROL",
          items: [reports, settings],
        }
      ];
    }

    const bookingsQueue = { name: "Booking Queue", href: `${pathPrefix}/bookings`, icon: FileSpreadsheet };
    const dealerBlocks = { name: "Dealer Blocks", href: `${pathPrefix}/blocks`, icon: Lock };
    const shipments = { name: "Shipments & Transit", href: `${pathPrefix}/in-transit`, icon: Truck };
    const reports = { name: "Reports & Export", href: `${pathPrefix}/reports`, icon: FileSpreadsheet };
    const settings = { name: "Settings", href: `${pathPrefix}/settings`, icon: Settings };
    const broadcasts = { name: "Broadcasts", href: `${pathPrefix}/announcements`, icon: Megaphone };

    if (role === "MANAGER") {
      const lowStock = { name: "Low Stock Alert", href: `${pathPrefix}/inventory?status=LOW_STOCK`, icon: AlertTriangle };
      const outOfStock = { name: "Out of Stock", href: `${pathPrefix}/inventory?status=OUT_OF_STOCK`, icon: PackageCheck };
      const dealersMgmt = { name: "Dealers List", href: `${pathPrefix}/dealers`, icon: Users };

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
          category: "REPORTING & MANAGEMENT",
          items: [dealersMgmt, broadcasts, reports, settings],
        }
      ];
    }

    if (role === "SHOWROOM_STAFF") {
      const stockBooking = { name: "Book Stock", href: `${pathPrefix}/blocks/new`, icon: Store };
      const myBookings = { name: "My Bookings", href: `${pathPrefix}/bookings`, icon: FileSpreadsheet };
      const myBlocks = { name: "My Blocks", href: `${pathPrefix}/blocks`, icon: Lock };

      return [
        {
          category: "SHOWROOM STAFF",
          items: [dashboard, stockBooking, myBookings, myBlocks, allStock],
        },
        {
          category: "ANALYTICS & CONTROL",
          items: [reports, settings],
        }
      ];
    }

    if (role === "SHOWROOM_INCHARGE") {
      const pendingApprovals = { name: "Pending Approvals", href: `${pathPrefix}/blocks?status=PENDING`, icon: Lock };
      const approvedBlocks = { name: "Approved Blocks", href: `${pathPrefix}/blocks?status=APPROVED`, icon: CheckCircle };

      return [
        {
          category: "SHOWROOM IN-CHARGE",
          items: [dashboard, pendingApprovals, approvedBlocks, allStock],
        },
        {
          category: "ANALYTICS & CONTROL",
          items: [reports, settings],
        }
      ];
    }

    if (role === "VIEWER") {
      return [
        {
          category: "OVERVIEW",
          items: [dashboard],
        },
        {
          category: "INVENTORY READ-ONLY",
          items: [allStock],
        },
        {
          category: "RESERVATIONS",
          items: [bookingsQueue],
        },
        {
          category: "LOGISTICS",
          items: [shipments],
        },
        {
          category: "ANALYTICS",
          items: [reports, settings],
        }
      ];
    }

    // Default configuration for SUPER ADMIN
    const lowStock = { name: "Low Stock Alert", href: `${pathPrefix}/inventory?status=LOW_STOCK`, icon: AlertTriangle };
    const outOfStock = { name: "Out of Stock", href: `${pathPrefix}/inventory?status=OUT_OF_STOCK`, icon: PackageCheck };
    const dealersMgmt = { name: "Dealers", href: `${pathPrefix}/dealers`, icon: Users };
    const warehousesMgmt = { name: "Warehouses", href: `${pathPrefix}/warehouses`, icon: WarehouseIcon };
    const audit = { name: "Audit Trail", href: `${pathPrefix}/system/audit`, icon: ShieldCheck };
    const usersMgmt = { name: "Users Management", href: `${pathPrefix}/users`, icon: Users };

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
        category: "SYSTEM MANAGEMENT",
        items: [dealersMgmt, warehousesMgmt, usersMgmt, broadcasts, reports, audit, settings],
      },
    ];
  };

  const navGroups = getNavItems();
  const currentDealerName = dealers.find(d => d.id === dealerId)?.name || "Select Dealer";
  const currentWarehouseName = warehouses.find(w => w.id === warehouseId)?.name || "Select Warehouse";

  // Checks if the user is in preview mode
  const isPreviewMode = session?.role === "SUPER_ADMIN" && !!session.previewRole;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F7F7F5] text-[#111111] antialiased font-sans">
      {/* MOBILE BACKDROP */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* DESKTOP SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#EAEAEA] bg-white transition-all duration-200 lg:static lg:z-auto ${
          mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-[72px]" : "lg:w-64"}`}
      >
        {/* BRAND LOGO */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#EAEAEA] px-4 bg-white">
          {(!collapsed || mobileOpen) ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2C202] font-black text-white shadow-xs">
                PT
              </div>
              <div className="flex flex-col">
                <h1 className="text-xs font-black tracking-wider text-[#111111] uppercase">PRESTIGE TILES</h1>
                <p className="text-[9px] font-bold text-[#F2C202] tracking-widest">ENTERPRISE ERP</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2C202] font-bold text-white shadow-xs">
              PT
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] lg:flex"
              title={collapsed ? "Collapse panel" : "Expand panel"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111] lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {(!collapsed || mobileOpen) && (
                <p className="px-3 pb-1 text-[9px] font-black tracking-widest text-[#9A9A9A] uppercase">
                  {group.category}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href.split("?")[0];
                  const isPending = !isActive && pendingHref === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      // Mark active on the click itself. The route may take a
                      // moment to commit, and waiting for it is what made
                      // navigation feel unacknowledged.
                      onClick={() => {
                        setPendingHref(item.href);
                        setMobileOpen(false);
                      }}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3.5 rounded-lg px-3 py-2 text-xs font-bold transition-all touch-target active:scale-[0.98] ${
                        isActive || isPending
                          ? "bg-[#F2C202]/10 text-[#8A7300] active-nav-indicator"
                          : "text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
                      }`}
                    >
                      {isPending ? (
                        <span
                          className="h-4 w-4 shrink-0 rounded-full border-2 border-[#F2C202] border-t-transparent animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <item.icon className="h-4 w-4 shrink-0" />
                      )}
                      {(!collapsed || mobileOpen) && <span>{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* SUPER ADMIN PREVIEW / SIMULATOR PANEL */}
        {session?.role === "SUPER_ADMIN" && (
          <div className="border-t border-[#EAEAEA] p-4 bg-white space-y-3">
            {(!collapsed || mobileOpen) ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-[#EAEAEA] pb-1.5">
                  <Sliders className="h-3.5 w-3.5 text-[#F2C202]" />
                  <span className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Inspect Preview Role</span>
                </div>

                <div className="space-y-1">
                  <p className="text-[9px] text-[#6B6B6B] font-bold uppercase">Viewing As</p>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-[#EAEAEA] bg-white p-1.5 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden font-bold"
                  >
                    <option value="SUPER_ADMIN">Super Admin (Default)</option>
                    <option value="MANAGER">Manager</option>
                    <option value="SHOWROOM_INCHARGE">Showroom In-Charge</option>
                    <option value="SHOWROOM_STAFF">Showroom Staff</option>
                    <option value="DEALER">Dealer Partner</option>
                    <option value="VIEWER">Read-Only Viewer</option>
                  </select>
                </div>

                {role === "DEALER" && dealers.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-[#6B6B6B] font-bold uppercase">Dealer Scope</p>
                    <select
                      value={dealerId}
                      onChange={(e) => handleDealerChange(e.target.value)}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-1.5 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
                    >
                      {dealers.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {role === "MANAGER" && warehouses.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-[#6B6B6B] font-bold uppercase">Depot Context</p>
                    <select
                      value={warehouseId}
                      onChange={(e) => handleWarehouseChange(e.target.value)}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-1.5 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                {(role === "SHOWROOM_STAFF" || role === "SHOWROOM_INCHARGE") && showrooms.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-[#6B6B6B] font-bold uppercase">Showroom Context</p>
                    <select
                      value={showroomId}
                      onChange={(e) => handleShowroomChange(e.target.value)}
                      className="w-full rounded-lg border border-[#EAEAEA] bg-white p-1.5 text-xs text-[#111111] focus:border-[#F2C202] focus:outline-hidden"
                    >
                      {showrooms.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-center">
                <button
                  onClick={() => setCollapsed(false)}
                  className="rounded-lg p-2 bg-[#F7F7F5] border border-[#EAEAEA] text-[#F2C202] hover:text-[#D8AD02]"
                  title="Expand Simulation controls"
                >
                  <Sliders className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* CONTENT INNER CONTAINER */}
      <div className="flex flex-1 flex-col overflow-hidden pb-16 lg:pb-0">
        {/* PREVIEW MODE WARNING BANNER */}
        {isPreviewMode && (
          <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs font-bold text-amber-900 shadow-xs">
            <span className="flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-amber-600 animate-pulse" />
              <span>Preview Mode: Viewing portal layout as {role.replace(/_/g, " ")}. Changes do not modify your Super Admin role status.</span>
            </span>
            <button
              onClick={() => handleRoleChange("SUPER_ADMIN")}
              className="rounded bg-white border border-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-950 hover:bg-amber-100 transition-all"
            >
              Exit Preview
            </button>
          </div>
        )}

        {/* PWA INSTALL BANNER */}
        {showInstallBanner && (
          <div className="flex items-center justify-between gap-4 bg-[#F2C202]/10 border-b border-[#EAEAEA] px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-[#F2C202] shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-[#111111]">Install Prestige Inventory</span>
                <span className="hidden sm:inline text-[#6B6B6B] ml-1.5">Access dashboard and reserves faster on home screen.</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="rounded-lg bg-[#F2C202] px-3 py-1 text-[10px] font-black text-white hover:bg-[#D8AD02] transition-all"
              >
                Install
              </button>
              <button
                onClick={handleDismissInstall}
                className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#F7F7F5] hover:text-[#111111]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* HEADER / TOPBAR */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#EAEAEA] bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Hamburger for mobile menu */}
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-[#EAEAEA] bg-white p-2 text-[#6B6B6B] hover:text-[#111111] lg:hidden touch-target"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Clickable Search input */}
            <button
              onClick={triggerSearch}
              className="flex items-center gap-3 rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-3 w-48 sm:w-80 text-left text-xs text-[#6B6B6B] hover:border-slate-300 transition-all touch-target"
            >
              <Search className="h-3.5 w-3.5 text-[#6B6B6B] shrink-0" />
              <span className="truncate flex-1 text-[#6B6B6B]">Search (⌘K or /)</span>
              <kbd className="hidden sm:inline-block rounded bg-white border border-[#EAEAEA] px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#6B6B6B]">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-3.5 text-xs text-[#111111] hover:bg-[#EAEAEA] transition-all touch-target font-bold select-none"
              >
                <UserIcon className="h-4 w-4 text-[#F2C202] shrink-0" />
                <span className="hidden sm:inline">{session?.name || "B2B User"}</span>
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-[#EAEAEA] bg-white p-2 shadow-md z-50 text-xs">
                  <div className="px-3 py-2 border-b border-[#EAEAEA] mb-1.5 text-[#6B6B6B]">
                    <p className="font-bold text-[#111111] truncate">{session?.name || "B2B User"}</p>
                    <p className="text-[10px] truncate mt-0.5">{session?.email || "user@prestigetiles.co"}</p>
                    <p className="mt-1.5 font-bold font-mono text-[9px] text-[#8A7300] uppercase tracking-wide">
                      {actualRole.replace(/_/g, " ")} {isPreviewMode && `(Preview)`}
                    </p>
                  </div>
                  <Link
                    href={`${pathPrefix}/settings`}
                    onClick={() => setProfileDropdownOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[#F7F7F5] text-[#111111] font-bold"
                  >
                    <Settings className="h-4 w-4 text-[#6B6B6B]" /> User Settings
                  </Link>
                  <button
                    onClick={() => { setProfileDropdownOpen(false); handleLogout(); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-rose-50 text-rose-700 font-bold"
                  >
                    <LogOut className="h-4 w-4 text-rose-600" /> Sign Out
                  </button>
                </div>
              )}
            </div>

            {/* Connectivity status */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EAEAEA] bg-white text-[10px] font-bold select-none">
              <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-rose-500 animate-ping"}`}></span>
              <span className={isOnline ? "text-[#6B6B6B]" : "text-rose-700"}>
                {isOnline ? "Connected" : "Offline"}
              </span>
            </div>

            {/* Notification Indicator */}
            <NotificationCenter session={session} />
          </div>
        </header>

        {/* CONTAINER CONTENT */}
        <main className="flex-1 overflow-y-auto bg-[#F7F7F5] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR FOR DEALER */}
      {role === "DEALER" && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-[#EAEAEA] bg-white/95 backdrop-blur-md px-2 lg:hidden mobile-bottom-nav">
          <BottomTabLink href={`${pathPrefix}/dashboard`} icon={LayoutDashboard} label="Home" active={pathname === `${pathPrefix}/dashboard`} />
          <BottomTabLink href={`${pathPrefix}/inventory`} icon={Boxes} label="Products" active={pathname === `${pathPrefix}/inventory`} />
          <BottomTabLink href={`${pathPrefix}/blocks/new`} icon={Store} label="Book" active={pathname === `${pathPrefix}/blocks/new`} />
          <BottomTabLink href={`${pathPrefix}/bookings`} icon={FileSpreadsheet} label="Bookings" active={pathname === `${pathPrefix}/bookings`} />
          <BottomTabLink href={`${pathPrefix}/settings`} icon={Settings} label="Settings" active={pathname === `${pathPrefix}/settings`} />
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
        active ? "text-[#8A7300]" : "text-[#6B6B6B]"
      }`}
    >
      <Icon className={`h-5 w-5 ${active ? "text-[#8A7300]" : "text-[#6B6B6B]"}`} />
      <span>{label}</span>
    </Link>
  );
}
