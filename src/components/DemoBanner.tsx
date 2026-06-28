"use client";

// CAPSULE — hosted-demo banner.
// A thin, dismissible strip shown ONLY on the hosted deployment (not localhost).
// Detection is client-side and gated behind a mounted check so the server render
// (which always omits the banner) and the first client render agree — no
// hydration mismatch. Dismissal persists in localStorage.

import { useEffect, useState } from "react";

const STORAGE_KEY = "capsule-demo-banner";

function isHostedHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h !== "localhost" && h !== "127.0.0.1";
}

export function DemoBanner() {
  // `null` until mounted → render nothing on the server and the first client
  // paint, so hydration can never diverge on the banner row.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    setShow(isHostedHost() && !dismissed);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  };

  if (!show) return null;

  return (
    <div className="flex items-center gap-[8px] border-b border-[#cfe0fd] bg-[var(--activebg)] px-[14px] py-[6px] text-[12px] leading-[1.4] text-[var(--blue-d)]">
      <span className="mono flex-none rounded-[5px] bg-[var(--blue)] px-[6px] py-[2px] text-[9.5px] font-bold uppercase tracking-[.05em] text-white">
        Live demo
      </span>
      <span className="min-w-0 flex-1">
        The chat agent runs on a free cloud model (Gemini); full local
        session-capture needs Ollama on your machine.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss demo banner"
        className="grid h-[20px] w-[20px] flex-none place-items-center rounded-[5px] text-[var(--blue)] transition-colors hover:bg-white/60"
      >
        ✕
      </button>
    </div>
  );
}
