"use client";

import React, { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

type Phase = "idle" | "pending" | "success" | "error";

interface ActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** The mutation. The button stays disabled until this settles. */
  onAction: () => Promise<unknown> | unknown;
  /** Label swapped in while the action is in flight, e.g. "Approving…". */
  pendingLabel?: string;
  /** Label shown briefly on success, e.g. "Approved". */
  successLabel?: string;
  /** Label shown on failure. Defaults to "Try Again". */
  errorLabel?: string;
  /** How long the success state lingers before reverting. */
  successMs?: number;
  children: React.ReactNode;
}

/**
 * Button for mutations that must acknowledge the click immediately and can
 * never double-submit.
 *
 * The phase flips synchronously on click — before the request is sent — so
 * feedback doesn't depend on server latency. An in-flight ref guards against
 * rapid double taps even before React re-renders, which a disabled-prop check
 * alone can miss on touch devices.
 */
export function ActionButton({
  onAction,
  pendingLabel,
  successLabel,
  errorLabel = "Try Again",
  successMs = 1600,
  children,
  disabled,
  className = "",
  ...rest
}: ActionButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const inFlight = useRef(false);

  const handleClick = async () => {
    if (inFlight.current) return; // hard guard: survives double taps pre-render
    inFlight.current = true;
    setPhase("pending");
    try {
      await onAction();
      setPhase("success");
      window.setTimeout(() => setPhase("idle"), successMs);
    } catch (err) {
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  };

  const label =
    phase === "pending" ? pendingLabel ?? children
    : phase === "success" ? successLabel ?? children
    : phase === "error" ? errorLabel
    : children;

  return (
    <button
      {...rest}
      onClick={handleClick}
      disabled={disabled || phase === "pending"}
      aria-busy={phase === "pending"}
      className={`inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
        phase === "error" ? "ring-1 ring-rose-400" : ""
      } ${className}`}
    >
      {phase === "pending" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}
      {phase === "success" && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}
