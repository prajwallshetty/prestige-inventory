import { toast as sonnerToast, ExternalToast } from "sonner";

/**
 * Deduplicated Toast Utility.
 * Prevents multiple identical toasts from stacking up when actions are repeatedly clicked.
 */

const recentToasts = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000;

function getStableId(message: string | React.ReactNode, customId?: string | number): string {
  if (customId) return String(customId);
  if (typeof message === "string") {
    return "toast_" + message.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50);
  }
  return "toast_custom_" + Math.random().toString(36).substring(2, 7);
}

function shouldSuppress(toastId: string): boolean {
  const now = Date.now();
  const lastTime = recentToasts.get(toastId);
  if (lastTime && now - lastTime < DEDUP_WINDOW_MS) {
    return true;
  }
  recentToasts.set(toastId, now);
  // Clean up old entries
  if (recentToasts.size > 100) {
    for (const [key, time] of recentToasts.entries()) {
      if (now - time > DEDUP_WINDOW_MS * 2) {
        recentToasts.delete(key);
      }
    }
  }
  return false;
}

export const toast = {
  success(message: string | React.ReactNode, options?: ExternalToast) {
    const id = getStableId(message, options?.id);
    if (shouldSuppress(id) && !options?.id) return id;
    return sonnerToast.success(message, { id, ...options });
  },

  error(message: string | React.ReactNode, options?: ExternalToast) {
    const id = getStableId(message, options?.id);
    if (shouldSuppress(id) && !options?.id) return id;
    return sonnerToast.error(message, { id, ...options });
  },

  info(message: string | React.ReactNode, options?: ExternalToast) {
    const id = getStableId(message, options?.id);
    if (shouldSuppress(id) && !options?.id) return id;
    return sonnerToast.info(message, { id, ...options });
  },

  warning(message: string | React.ReactNode, options?: ExternalToast) {
    const id = getStableId(message, options?.id);
    if (shouldSuppress(id) && !options?.id) return id;
    return sonnerToast.warning(message, { id, ...options });
  },

  loading(message: string | React.ReactNode, options?: ExternalToast) {
    const id = getStableId(message, options?.id);
    return sonnerToast.loading(message, { id, ...options });
  },

  dismiss(id?: string | number) {
    if (id) recentToasts.delete(String(id));
    return sonnerToast.dismiss(id);
  },

  /**
   * Helper for custom toast message with arbitrary options
   */
  custom(message: string | React.ReactNode, options?: ExternalToast) {
    const id = getStableId(message, options?.id);
    if (shouldSuppress(id) && !options?.id) return id;
    return sonnerToast(message, { id, ...options });
  },
};

export default toast;
