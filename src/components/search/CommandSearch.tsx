"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CornerDownLeft,
  FileText,
  Lock,
  MapPin,
  Package,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { globalSearchAction } from "@/app/actions";

type Category = "products" | "blocks" | "dealers" | "showrooms" | "actions";

interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  category: Category;
  url: string;
}

const QUICK_ACTIONS: SearchResultItem[] = [
  { id: "act-inv", title: "All stock inventory", subtitle: "Live stock levels", category: "actions", url: "/inventory" },
  { id: "act-blocks", title: "Stock blocks", subtitle: "Reservations and approvals", category: "actions", url: "/blocks" },
  { id: "act-new-block", title: "New stock block", subtitle: "Reserve stock for a dealer", category: "actions", url: "/blocks/new" },
  { id: "act-pending", title: "Pending approvals", subtitle: "Blocks awaiting a decision", category: "actions", url: "/blocks?status=PENDING" },
  { id: "act-rep", title: "Reports and exports", subtitle: "Inventory and movement CSVs", category: "actions", url: "/reports" },
];

/**
 * Global command palette (⌘K / Ctrl-K, or "/").
 *
 * Searches products, blocks, dealers and showrooms server-side, capped and
 * scoped to the caller. Previously it queried product name and code only, and
 * a slow response could overwrite a newer one.
 */
export function CommandSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>(QUICK_ACTIONS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((open) => !open);
      } else if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults(QUICK_ACTIONS);
      setSelectedIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const runSearch = useCallback(async (q: string) => {
    // Every request gets a sequence number; a reply that is not the newest is
    // dropped, so "ACR" can never overwrite "BEI" (spec §24).
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const res = await globalSearchAction(q);
      if (seq !== seqRef.current) return;

      const mapped: SearchResultItem[] = [
        ...res.products.map((p) => ({
          id: `p-${p.id}`,
          title: p.name,
          subtitle: [p.productNumber, p.size, p.brand].filter(Boolean).join(" · "),
          meta: `${p.availableStock} free`,
          category: "products" as const,
          url: `/inventory?search=${encodeURIComponent(p.productNumber !== "—" ? p.productNumber : p.name)}`,
        })),
        ...res.blocks.map((b) => ({
          id: `b-${b.id}`,
          title: b.blockNumber || "Block",
          subtitle: [b.product, b.dealer].filter(Boolean).join(" · "),
          meta: b.status.replace(/_/g, " "),
          category: "blocks" as const,
          url: `/blocks/${b.id}`,
        })),
        ...res.dealers.map((d) => ({
          id: `d-${d.id}`,
          title: d.name,
          subtitle: [d.dealerId, d.company].filter(Boolean).join(" · ") || undefined,
          category: "dealers" as const,
          url: `/blocks?dealerId=${d.id}`,
        })),
        ...res.showrooms.map((s) => ({
          id: `s-${s.id}`,
          title: s.name,
          subtitle: s.city || undefined,
          category: "showrooms" as const,
          url: `/blocks?showroomId=${s.id}`,
        })),
        ...QUICK_ACTIONS.filter(
          (a) =>
            a.title.toLowerCase().includes(q.toLowerCase()) ||
            a.subtitle?.toLowerCase().includes(q.toLowerCase())
        ),
      ];

      setResults(mapped);
      setSelectedIndex(0);
    } catch {
      if (seq === seqRef.current) setResults([]);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      seqRef.current++; // cancel any in-flight response
      setLoading(false);
      setResults(QUICK_ACTIONS);
      setSelectedIndex(0);
      return;
    }
    const t = setTimeout(() => runSearch(q), 220);
    return () => clearTimeout(t);
  }, [query, isOpen, runSearch]);

  const handleSelect = (item: SearchResultItem) => {
    setIsOpen(false);
    router.push(item.url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) {
      if (e.key === "Escape") setIsOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[10vh] backdrop-blur-xs"
      onClick={() => setIsOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white font-sans text-xs text-[#111111] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[#EAEAEA] bg-[#F7F7F5] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Product, SKU, brand, block number, dealer, showroom…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
            className="w-full bg-transparent text-xs font-medium text-[#111111] placeholder-[#9A9A9A] focus:outline-hidden"
          />
          <kbd className="flex items-center gap-0.5 rounded-md border border-[#EAEAEA] bg-white px-2 py-0.5 font-mono text-[9px] font-bold text-[#6B6B6B] shadow-xs">
            ESC
          </kbd>
        </div>

        <div className="max-h-[360px] space-y-1 overflow-y-auto p-2">
          {loading && (
            <div className="space-y-2 p-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-[#EAEAEA]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-[#EAEAEA]" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-[#F7F7F5]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="py-8 text-center text-xs text-[#6B6B6B]">
              <p className="font-bold text-[#111111]">No results found.</p>
              <p className="mt-1">Try a product number, block number or dealer name.</p>
            </div>
          )}

          {!loading &&
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all ${
                    isSelected ? "bg-[#F2C202]/10" : "hover:bg-[#F7F7F5]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`shrink-0 ${isSelected ? "text-[#8A7300]" : "text-[#6B6B6B]"}`}>
                      <CategoryIcon category={item.category} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-xs font-bold ${
                          isSelected ? "text-[#8A7300]" : "text-[#111111]"
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="mt-0.5 block truncate text-[10px] text-[#6B6B6B]">
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                  </div>

                  <span className="flex shrink-0 items-center gap-2 text-[9px] font-bold uppercase text-[#6B6B6B]">
                    {item.meta && (
                      <span className="rounded-md border border-[#EAEAEA] bg-[#F7F7F5] px-2 py-0.5">
                        {item.meta}
                      </span>
                    )}
                    {isSelected && (
                      <span className="flex items-center gap-0.5 text-[#8A7300]">
                        Go <CornerDownLeft className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
        </div>

        <div className="flex items-center justify-between border-t border-[#EAEAEA] bg-[#F7F7F5] px-4 py-2 text-[10px] text-[#6B6B6B]">
          <span className="flex items-center gap-1.5 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-[#F2C202]" />
            Products, blocks, dealers and showrooms
          </span>
          <span className="hidden items-center gap-2 font-medium sm:flex">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoryIcon({ category }: { category: Category }) {
  switch (category) {
    case "products":
      return <Package className="h-4 w-4" />;
    case "blocks":
      return <Lock className="h-4 w-4" />;
    case "dealers":
      return <User className="h-4 w-4" />;
    case "showrooms":
      return <MapPin className="h-4 w-4" />;
    default:
      return <ArrowRight className="h-4 w-4" />;
  }
}
