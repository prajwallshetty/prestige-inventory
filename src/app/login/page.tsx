"use client";

import React, { useState } from "react";
import { signInAction } from "@/app/actions";
import { AlertCircle, ArrowRight, KeyRound, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [loginCode, setLoginCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginCode.trim()) {
      setError("Please enter your login code.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("loginCode", loginCode.trim());

    try {
      const result = await signInAction(formData);
      if (!result.ok) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : result.data.redirectTo;
    } catch {
      setError("Connection failed. Please check your network and try again.");
      setIsSubmitting(false);
    }
  };

  const handleQuickCode = (code: string) => {
    setLoginCode(code);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F5] px-4 py-8 sm:px-6 lg:px-8 font-sans antialiased text-[#111111]">
      <div className="w-full max-w-md space-y-6">
        {/* BRAND LOGO & HEADER */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-[#EAEAEA] p-1 shadow-xs">
            <img src="/icons/logo.png" alt="Prestige Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <h2 className="text-xs font-black tracking-widest text-[#111111] uppercase">PRESTIGE TILES</h2>
            <p className="text-[10px] font-bold text-[#6B6B6B] tracking-wider mt-0.5">Inventory & Portal Management</p>
          </div>
        </div>

        {/* LOGIN CARD */}
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-6 sm:p-8 shadow-xs space-y-5">
          <div className="space-y-1 text-center sm:text-left">
            <h1 className="text-lg font-black text-[#111111]">Welcome Back</h1>
            <p className="text-xs text-[#6B6B6B]">Enter your assigned unique login code to access your portal.</p>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-3.5 flex items-start gap-2.5 text-xs text-rose-800 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-code-input" className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-wider">
                Unique Login Code *
              </label>
              <div className="relative flex items-center">
                <input
                  id="login-code-input"
                  type="text"
                  required
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  placeholder="e.g. ADM-001 or SH01-ST-001"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] px-4 py-3.5 text-sm font-bold font-mono text-[#111111] placeholder:font-normal placeholder-[#9A9A9A] focus:border-[#F2C202] focus:bg-white focus:outline-hidden transition-all min-h-[48px] uppercase tracking-wider"
                />
                <KeyRound className="absolute right-3.5 h-4 w-4 text-[#9A9A9A] pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !loginCode.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#F2C202] py-3.5 text-xs sm:text-sm font-black text-white hover:bg-[#D8AD02] active:scale-[0.99] transition-all shadow-sm disabled:opacity-50 cursor-pointer min-h-[48px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* QUICK DEMO CODES FOR DEVELOPMENT / TESTING */}
          <div className="border-t border-[#EAEAEA] pt-4 space-y-2.5">
            <p className="text-[9px] font-black uppercase text-[#6B6B6B] tracking-wider text-center">
              Quick Select Demo Login Codes
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickCode("ADM-001")}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 px-2.5 text-[10px] font-bold text-[#111111] hover:bg-[#F2C202]/15 hover:border-[#F2C202] transition-all text-left flex items-center justify-between cursor-pointer touch-target"
              >
                <span>Super Admin</span>
                <span className="font-mono text-[#8A7300] font-black">ADM-001</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickCode("MGR-001")}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 px-2.5 text-[10px] font-bold text-[#111111] hover:bg-[#F2C202]/15 hover:border-[#F2C202] transition-all text-left flex items-center justify-between cursor-pointer touch-target"
              >
                <span>Manager</span>
                <span className="font-mono text-[#8A7300] font-black">MGR-001</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickCode("SH01-IC-001")}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 px-2.5 text-[10px] font-bold text-[#111111] hover:bg-[#F2C202]/15 hover:border-[#F2C202] transition-all text-left flex items-center justify-between cursor-pointer touch-target"
              >
                <span>Showroom In-Charge</span>
                <span className="font-mono text-[#8A7300] font-black">SH01-IC-001</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickCode("SH01-ST-001")}
                className="rounded-lg border border-[#EAEAEA] bg-[#F7F7F5] py-2 px-2.5 text-[10px] font-bold text-[#111111] hover:bg-[#F2C202]/15 hover:border-[#F2C202] transition-all text-left flex items-center justify-between cursor-pointer touch-target"
              >
                <span>Showroom Staff</span>
                <span className="font-mono text-[#8A7300] font-black">SH01-ST-001</span>
              </button>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center space-y-1">
          <p className="text-[10px] text-[#6B6B6B] font-medium">
            Prestige Tiles B2B Portal © {new Date().getFullYear()} • Encrypted Server-Side Session
          </p>
        </div>
      </div>
    </div>
  );
}
