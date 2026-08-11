"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, CornerDownLeft, Package, User, FileText, MapPin, Sparkles } from "lucide-react";
import { globalSearchAction } from "@/app/actions";

interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "products" | "dealers" | "bookings" | "warehouses" | "actions";
  url: string;
}

export function CommandSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // List of default quick actions
  const quickActions: SearchResultItem[] = [
    { id: "act-inv", title: "View All Stock Inventory", subtitle: "Jump to main stock book list", category: "actions", url: "/inventory" },
    { id: "act-new", title: "New Stock Reservation hold", subtitle: "Submit a new booking hold request", category: "actions", url: "/bookings/new" },
    { id: "act-queue", title: "All Booking Reservations", subtitle: "Open hold queues & approvals", category: "actions", url: "/bookings" },
    { id: "act-rep", title: "Export System Reports", subtitle: "Download audit movements & inventory CSV", category: "actions", url: "/reports" },
  ];

  // Hotkey listener for ⌘K or /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((open) => !open);
      } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch results when query changes
  useEffect(() => {
    if (!isOpen) return;
    if (query.trim().length < 2) {
      setResults(quickActions);
      setSelectedIndex(0);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await globalSearchAction(query);
        const mappedResults: SearchResultItem[] = [];

        // Map products
        res.products.forEach((p) => {
          mappedResults.push({
            id: p.id,
            title: p.name,
            subtitle: `SKU: ${p.productCode || p.id.slice(-6).toUpperCase()}`,
            category: "products",
            url: `/inventory?search=${p.name}`,
          });
        });

        // Map bookings
        res.bookings.forEach((b) => {
          mappedResults.push({
            id: b.id,
            title: b.bookingNumber,
            subtitle: `Status: ${b.status}`,
            category: "bookings",
            url: `/bookings/${b.id}`,
          });
        });

        // Map dealers
        res.dealers.forEach((d) => {
          mappedResults.push({
            id: d.id,
            title: d.name,
            subtitle: d.company || undefined,
            category: "dealers",
            url: `/bookings?dealerId=${d.id}`,
          });
        });

        // Map warehouses
        res.warehouses.forEach((w) => {
          mappedResults.push({
            id: w.id,
            title: w.name,
            subtitle: `Code: ${w.code}`,
            category: "warehouses",
            url: `/inventory?warehouseId=${w.id}`,
          });
        });

        // Append filtered quick actions
        const matchedActions = quickActions.filter(
          (a) =>
            a.title.toLowerCase().includes(query.toLowerCase()) ||
            a.subtitle?.toLowerCase().includes(query.toLowerCase())
        );
        mappedResults.push(...matchedActions);

        setResults(mappedResults);
        setSelectedIndex(0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [query, isOpen]);

  // Reset indices and focus when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setResults(quickActions);
      setSelectedIndex(0);
      setQuery("");
    }
  }, [isOpen]);

  // Navigate using Keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSelect = (item: SearchResultItem) => {
    setIsOpen(false);
    router.push(item.url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 p-4 pt-[12vh] backdrop-blur-xs">
      <div 
        className="w-full max-w-xl rounded-xl border border-slate-800 bg-[#0c1122] shadow-2xl overflow-hidden flex flex-col scale-100 transition-all"
        onKeyDown={handleKeyDown}
      >
        {/* INPUT HEADER */}
        <div className="flex items-center gap-3 border-b border-slate-850 px-4 py-3 bg-[#080c16]">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search SKU, tiles, brands, bookings, or type quick actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-hidden"
          />
          <div className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
            <span>ESC</span>
          </div>
        </div>

        {/* RESULTS SCROLL */}
        <div className="max-h-[350px] overflow-y-auto p-2 space-y-1">
          {loading && (
            <div className="text-center py-6 text-xs text-slate-450 flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-amber-500" />
              Searching database...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-500">
              No matching products, bookings, or actions found.
            </div>
          )}

          {!loading && results.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id + idx}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 cursor-pointer transition-colors ${
                  isSelected ? "bg-slate-900/60 border-l-2 border-amber-500" : "hover:bg-slate-900/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-slate-400 shrink-0">
                    <CategoryIcon category={item.category} />
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${isSelected ? "text-amber-400" : "text-white"}`}>
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[9px] text-slate-500 font-bold uppercase">
                  {isSelected && (
                    <span className="flex items-center gap-0.5 text-amber-500/80">
                      Go <CornerDownLeft className="h-3 w-3" />
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 bg-slate-900/80 rounded border border-slate-850">
                    {item.category}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* COMMAND PALETTE FOOTER */}
        <div className="border-t border-slate-850 bg-[#080c16] px-4 py-2 flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Search or command shortcuts active</span>
          </span>
          <span className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoryIcon({ category }: { category: SearchResultItem["category"] }) {
  switch (category) {
    case "products":
      return <Package className="h-4 w-4" />;
    case "dealers":
      return <User className="h-4 w-4" />;
    case "bookings":
      return <FileText className="h-4 w-4" />;
    case "warehouses":
      return <MapPin className="h-4 w-4" />;
    default:
      return <ArrowRight className="h-4 w-4" />;
  }
}
