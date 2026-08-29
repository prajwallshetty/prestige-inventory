"use client";

import { useRef, useState, useCallback } from "react";

/**
 * Reusable hook to protect buttons against double clicks / rapid multi-clicks.
 * Ensures an async function runs only once per action, keeping state updated.
 */
export function useActionLock<T extends (...args: any[]) => Promise<any>>(actionFn: T) {
  const [isPending, setIsPending] = useState(false);
  const lockRef = useRef(false);

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
      if (lockRef.current) {
        return undefined;
      }

      lockRef.current = true;
      setIsPending(true);

      try {
        const result = await actionFn(...args);
        return result;
      } finally {
        lockRef.current = false;
        setIsPending(false);
      }
    },
    [actionFn]
  );

  return { execute, isPending };
}
