"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * The raffle's public link as a QR code, generated in the browser (no outside service): shown in the link sheet,
 * and downloadable or shareable as a poster image (raffle name, the code, "Escanea…", the address) to print or
 * put in a status.
 */
export function LinkQrCard({ url, raffleName }: { url: string; raffleName: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 480, color: { dark: "#111111", light: "#ffffff" } })
      .then((d) => !cancelled && setQr(d))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const poster = async (): Promise<Blob> => {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    // Name, shrunk to fit one line.
    let size = 72;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    while (ctx.measureText(raffleName).width > W - 120 && size > 36) {
      size -= 4;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
    }
    ctx.fillText(raffleName, W / 2, 150);
    ctx.font = "600 40px system-ui, sans-serif";
    ctx.fillStyle = "#555555";
    ctx.fillText("Escanea para ver los números disponibles", W / 2, 225);
    const code = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 800, color: { dark: "#111111", light: "#ffffff" } });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("qr"));
      img.src = code;
    });
    ctx.drawImage(img, (W - 800) / 2, 290, 800, 800);
    ctx.font = "500 30px system-ui, sans-serif";
    ctx.fillStyle = "#333333";
    ctx.fillText(url.replace(/^https?:\/\//, ""), W / 2, 1160);
    ctx.font = "700 32px system-ui, sans-serif";
    ctx.fillStyle = "#b8860b";
    ctx.fillText("Ibirifas", W / 2, 1260);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
  };

  const fileName = `qr-${raffleName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rifa"}.png`;

  const download = async () => {
    setBusy(true);
    try {
      const blob = await poster();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } finally {
      setBusy(false);
    }
  };

  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [new File([new Blob()], "x.png", { type: "image/png" })] });

  const share = async () => {
    setBusy(true);
    try {
      const file = new File([await poster()], fileName, { type: "image/png" });
      await navigator.share({ files: [file], title: raffleName, text: `Escanea o abre: ${url}` }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface-2 p-3">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-white p-1.5">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`Código QR del enlace de ${raffleName}`} className="h-full w-full" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-text">Código QR</p>
        <p className="text-xs text-text-muted">Para imprimir en afiches o mostrar en pantalla: al escanearlo se abre el enlace.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy || !qr}
            className="h-9 rounded-xl border border-gold-600/50 px-3 text-xs font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-50"
          >
            Descargar QR
          </button>
          {canShareFiles && (
            <button
              type="button"
              onClick={() => void share()}
              disabled={busy || !qr}
              className="h-9 rounded-xl border border-line px-3 text-xs font-semibold text-text transition active:scale-[0.98] disabled:opacity-50"
            >
              Compartir QR
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
