"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { accountQrPath, brebKeyText } from "@/lib/accountText";
import type { RaffleAccountDTO } from "@/lib/types";

/**
 * The payment accounts of a raffle: each one with a copy button and, for a Bre-B llave, what kind of
 * llave it is and its QR (opened on demand, so the image is only downloaded by whoever wants it).
 * `token` is the raffle's public link (visitors); without it the QR is fetched with the team's session.
 */
export function AccountsList({
  accounts,
  token,
  holderWord = "Titular",
}: {
  accounts: RaffleAccountDTO[];
  token?: string | null;
  /** How the holder of a regular account is introduced ("Titular", "Responsable"). */
  holderWord?: string;
}) {
  return (
    <div className="space-y-2">
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} token={token} holderWord={holderWord} />
      ))}
    </div>
  );
}

function AccountRow({ account: a, token, holderWord }: { account: RaffleAccountDTO; token?: string | null; holderWord: string }) {
  const [qrOpen, setQrOpen] = useState(false);
  const breb = a.kind === "breb";
  const showBrebBadge = breb && !/bre-?b/i.test(a.label);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 break-words">
          <span className="font-semibold text-text">{a.label}</span>
          {showBrebBadge && (
            <span className="ml-1 rounded-full bg-gold-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold-400">Bre-B</span>
          )}{" "}
          {breb && <span className="text-xs">({brebKeyText(a.keyType)}) </span>}
          <span className="text-text">{a.number}</span>
          {a.holderName && (
            <span>
              {" "}
              · {breb ? "Titular" : holderWord}: {a.holderName}
            </span>
          )}
        </p>
        <CopyButton text={a.number} label={breb ? `llave de ${a.label}` : `número de ${a.label}`} />
      </div>
      {a.hasQr && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            aria-expanded={qrOpen}
            className="text-xs font-semibold text-gold-400 underline-offset-2 hover:underline"
          >
            {qrOpen ? "Ocultar QR" : "Ver QR para pagar"}
          </button>
          {qrOpen && (
            <div className="mt-2 flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
              <img
                src={accountQrPath(a.id, token)}
                alt={`QR de ${a.label}`}
                className="h-auto w-48 max-w-full rounded-xl bg-white p-2"
              />
              <span className="text-[11px]">Escanéalo desde la app de tu banco</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
