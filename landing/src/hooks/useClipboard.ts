import { useState, useCallback, useRef, useEffect } from "react";

export type ClipboardStatus = "idle" | "copied" | "error";

export interface UseClipboardReturn {
  status: ClipboardStatus;
  copy: (text: string) => Promise<void>;
}

export function useClipboard(timeout = 2000): UseClipboardReturn {
  const [status, setStatus] = useState<ClipboardStatus>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (!navigator?.clipboard?.writeText) {
        setStatus("error");
        timerRef.current = window.setTimeout(() => {
          setStatus("idle");
          timerRef.current = null;
        }, timeout);
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        setStatus("copied");
        timerRef.current = window.setTimeout(() => {
          setStatus("idle");
          timerRef.current = null;
        }, timeout);
      } catch {
        setStatus("error");
        timerRef.current = window.setTimeout(() => {
          setStatus("idle");
          timerRef.current = null;
        }, timeout);
      }
    },
    [timeout]
  );

  return { status, copy };
}
