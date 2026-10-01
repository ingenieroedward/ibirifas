"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPendingPaymentsCount } from "@/lib/api-client";

const EVERY_MS = 60_000;

/**
 * A round button to "Pagos recibidos" with how many bank payments wait for the team. Only shown when the
 * organization is connected to pagoradar; refreshes every minute and when the app comes back to the front.
 */
export function PaymentsLink() {
  const [state, setState] = useState<{ enabled: boolean; pending: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      getPendingPaymentsCount()
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, EVERY_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  if (!state?.enabled) return null;
  const label = state.pending > 0 ? `Pagos recibidos: ${state.pending} por revisar` : "Pagos recibidos";
  return (
    <Link
      href="/pagos"
      aria-label={label}
      title={label}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-90 ${
        state.pending > 0 ? "border-gold-600/60 text-gold-400" : "border-line text-text-muted"
      }`}
    >
      <BankIcon className="h-4 w-4" />
      {state.pending > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-[#241a02] ring-2 ring-bg"
        >
          {state.pending > 9 ? "9+" : state.pending}
        </span>
      )}
    </Link>
  );
}

function BankIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3l9-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
