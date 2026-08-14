"use client";

import React, { useState } from "react";
import { signInAction } from "@/app/actions";
import { AlertCircle, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    try {
      const redirectUrl = await signInAction(formData);
      window.location.href = redirectUrl;
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] px-4 py-12 sm:px-6 lg:px-8 font-sans antialiased text-[#111111]">
      <div className="w-full max-w-md space-y-8">
        {/* BRAND IDENTITY */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2C202] font-black text-white text-xl shadow-xs">
            PT
          </div>
          <div>
            <h2 className="text-sm font-black tracking-widest text-[#111111] uppercase">PRESTIGE TILES</h2>
            <p className="text-[10px] font-bold text-[#6B6B6B] tracking-wider mt-0.5">Inventory & Dealer Portal</p>
          </div>
          <p className="text-xs text-[#6B6B6B] max-w-xs mx-auto mt-2">
            Manage warehouse inventory, real-time reservations, and dealer bookings from one secure platform.
          </p>
        </div>

        {/* LOGIN CARD */}
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-8 shadow-sm space-y-6">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 flex gap-2.5 items-start text-xs text-rose-800 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Email Address</label>
              <input
                type="email"
                required
                placeholder="name@prestigetiles.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3.5 py-2.5 text-xs text-[#111111] placeholder-[#9A9A9A] focus:border-[#F2C202] focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">Password</label>
                <a href="#" className="text-[10px] font-bold text-[#8A7300] hover:underline" onClick={(e) => { e.preventDefault(); alert("Contact system administrator to reset password."); }}>
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] px-3.5 py-2.5 text-xs text-[#111111] placeholder-[#9A9A9A] focus:border-[#F2C202] focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#F2C202] py-2.5 text-xs font-black text-white hover:bg-[#D8AD02] transition-all shadow-sm disabled:opacity-50 cursor-pointer mt-2"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* QUICK LOGIN BUTTONS */}
          <div className="border-t border-[#EAEAEA] pt-4 space-y-2">
            <p className="text-[9px] font-black uppercase text-[#6B6B6B] tracking-wider text-center">Quick Login for Testing</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setEmail("admin@prestigetiles.com"); setPassword("prestige123"); }}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-2 text-[10px] font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all text-center cursor-pointer"
              >
                Super Admin
              </button>
              <button
                type="button"
                onClick={() => { setEmail("manager@prestigetiles.com"); setPassword("prestige123"); }}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-2 text-[10px] font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all text-center cursor-pointer"
              >
                Manager
              </button>
              <button
                type="button"
                onClick={() => { setEmail("incharge@prestigetiles.com"); setPassword("prestige123"); }}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-2 text-[10px] font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all text-center cursor-pointer"
              >
                Showroom In-Charge
              </button>
              <button
                type="button"
                onClick={() => { setEmail("staff@prestigetiles.com"); setPassword("prestige123"); }}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-2 text-[10px] font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all text-center cursor-pointer"
              >
                Showroom Staff
              </button>
              <button
                type="button"
                onClick={() => { setEmail("dealer@prestigetiles.com"); setPassword("prestige123"); }}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-2 text-[10px] font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all text-center cursor-pointer"
              >
                Dealer Partner
              </button>
              <button
                type="button"
                onClick={() => { setEmail("viewer@prestigetiles.com"); setPassword("prestige123"); }}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-1.5 px-2 text-[10px] font-bold text-[#111111] hover:bg-[#EAEAEA] transition-all text-center cursor-pointer"
              >
                Viewer
              </button>
            </div>
          </div>
        </div>

        {/* FOOTER COOLDOWN */}
        <div className="text-center">
          <p className="text-[10px] text-[#6B6B6B] font-medium">
            Prestige Tiles ERP © {new Date().getFullYear()} • Secure Session Protected
          </p>
        </div>
      </div>
    </div>
  );
}
