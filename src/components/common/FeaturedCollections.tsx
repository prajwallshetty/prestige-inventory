"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export interface CollectionItem {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  image: string;
  href: string;
  badgeColor?: string;
}

const FEATURED_COLLECTIONS: CollectionItem[] = [
  {
    id: "premium-tiles",
    title: "Premium Tiles",
    subtitle: "Italian porcelain & large format slab tiles",
    tag: "Core Range",
    image: "/premium-tile.png",
    href: "/inventory?search=tile",
    badgeColor: "bg-[#F2C202] text-black",
  },
  {
    id: "designer-picks",
    title: "Designer Picks",
    subtitle: "Architect-curated patterns & marble motifs",
    tag: "Curated",
    image: "/designer-picks.png",
    href: "/inventory?search=designer",
    badgeColor: "bg-indigo-600 text-white",
  },
  {
    id: "luxury-bathrooms",
    title: "Luxury Bathrooms",
    subtitle: "Anti-skid wet area tiles & feature walls",
    tag: "Wet Areas",
    image: "/bathrooms.png",
    href: "/inventory?search=bathroom",
    badgeColor: "bg-emerald-600 text-white",
  },
  {
    id: "sanitary-collection",
    title: "Sanitaryware Collection",
    subtitle: "Premium ceramic basins, closets & bath fittings",
    tag: "Fixtures",
    image: "/sanitory-colllection.png",
    href: "/inventory?search=sanitary",
    badgeColor: "bg-amber-600 text-white",
  },
];

interface Props {
  className?: string;
  title?: string;
  description?: string;
}

export function FeaturedCollections({
  className = "",
  title = "Featured Collections",
  description = "Explore our signature tile collections, curated designs, and sanitaryware lines.",
}: Props) {
  return (
    <section className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#EAEAEA] pb-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-[#111111] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#F2C202]" />
            {title}
          </h2>
          {description && <p className="text-xs text-[#6B6B6B] mt-0.5">{description}</p>}
        </div>
        <Link
          href="/inventory"
          className="text-xs font-bold text-[#8A7300] hover:text-[#D8AD02] transition-colors flex items-center gap-1 shrink-0"
        >
          View All Inventory <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURED_COLLECTIONS.map((col) => (
          <Link
            key={col.id}
            href={col.href}
            className="group relative flex flex-col justify-end overflow-hidden rounded-2xl border border-[#EAEAEA] bg-slate-900 shadow-xs hover:shadow-md transition-all duration-300 min-h-[220px]"
          >
            {/* Background Image with Hover Scale */}
            <div className="absolute inset-0 z-0 overflow-hidden">
              <img
                src={col.image}
                alt={col.title}
                className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
                onError={(e) => {
                  // Fallback gradient if image fails to render
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            </div>

            {/* Tag Badge */}
            <div className="absolute top-3 right-3 z-10">
              <span className={`px-2.5 py-1 rounded-full text-[9.5px] font-black uppercase tracking-wider shadow-xs ${col.badgeColor}`}>
                {col.tag}
              </span>
            </div>

            {/* Content Container */}
            <div className="relative z-10 p-4 space-y-1 text-white">
              <h3 className="text-base font-black tracking-tight group-hover:text-[#F2C202] transition-colors">
                {col.title}
              </h3>
              <p className="text-xs text-gray-200 line-clamp-2 font-medium opacity-90">
                {col.subtitle}
              </p>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#F2C202] group-hover:translate-x-1 transition-transform">
                <span>Browse Range</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
