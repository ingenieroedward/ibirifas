import { prisma } from "@/lib/prisma";
import { loosePrice } from "@/lib/combos";
import { accountLine, accountQrPath, accountSelect, toAccountDTO } from "@/lib/accounts";
import { ensureContrast, luminance, mix } from "@/lib/color";
import { resolvedTheme, type RaffleTheme } from "@/lib/theme";
import { formatCurrency, formatDate, formatNumberValue } from "@/lib/format";
import { mailEnabled, sendMail } from "@/lib/mail";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment";
import { amountRemaining, installmentCount, standingOf, stageSettingsOf } from "@/lib/stages";
import { describeHoldings } from "@/lib/whatsapp";
import { holdDeadline } from "@/lib/holds";
import type { PaymentMethod } from "@/lib/types";

/**
 * Emails to buyers who left an address when reserving from the public link: so they find out what
 * happened with their reservation without having to ask. Always fire-and-forget (`void emailBuyers(…)`):
 * a slow or missing mail server never affects the request that triggered it.
 */

export type BuyerEvent =
  | { kind: "reserved" }
  | { kind: "receipt" }
  | { kind: "approved"; method?: PaymentMethod | null }
  | { kind: "installment" }
  | { kind: "rejected"; reason: string | null }
  | { kind: "released"; why: "expired" | "manual" | "stage" }
  /** Their number won the draw (the raffle's, or a stage's). */
  | { kind: "won"; winnerValue: number; prize: string | null; stageLabel?: string | null; wins?: PrizeLine[] }
  /**
   * The result, for everyone else: someone won, the number wasn't up to date with its installments ("house"), or
   * nobody had it. `more`: a raffle by stages with draws still to come.
   */
  | { kind: "result"; winnerValue: number; outcome: "won" | "house" | "nobody"; stageLabel?: string | null; more?: boolean; extras?: PrizeLine[] };

/** One "Gana Más" prize, in words: "Al revés" · 74 · "$100.000". */
export interface PrizeLine {
  label: string;
  value: number;
  prize: string | null;
}

/** A number as it was when the event happened (for a release, read before the buyer was cleared). */
export interface BuyerRow {
  value: number;
  groupId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  holdToken: string | null;
  soldAt: Date | null;
  quotas?: { quota: number; paidAt: Date }[];
  /** Its share of a combo's price (lib/combos.ts); null/absent = the raffle's number price. */
  salePrice?: number | null;
}

/** The fields every event needs from the database, for a `select`. */
export const buyerRowSelect = {
  value: true,
  groupId: true,
  buyerName: true,
  buyerEmail: true,
  holdToken: true,
  soldAt: true,
  salePrice: true,
  quotas: { select: { quota: true, paidAt: true } },
} as const;

/** This site's address for links in emails: APP_URL, or the address the current request came in on. */
export async function mailOrigin(): Promise<string | null> {
  const fromEnv = process.env.APP_URL;
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      // Fall through.
    }
  }
  try {
    const { requestOrigin } = await import("@/lib/siteUrl");
    return (await requestOrigin()).origin;
  } catch {
    // Outside a request (the background sweep) and no APP_URL: emails go without links.
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

interface Composed {
  subject: string;
  /** Paragraphs; **bold** is rendered in the HTML version. */
  paragraphs: string[];
  /** Account lines to show under the text. */
  accounts?: string[];
  /** QR images (Bre-B) shown under the accounts. */
  qrImages?: { label: string; url: string }[];
  button?: { label: string; url: string };
}

/** The raffle's own look for its emails (same colors as its public page), always readable. */
export function emailColors(raffle: RaffleTheme) {
  const { background, numberColor, textColor } = resolvedTheme(raffle);
  return {
    header: background,
    // The raffle's color as the title on the header, nudged until it reads there.
    headerText: ensureContrast(numberColor, [background], 4.5),
    button: numberColor,
    buttonText: textColor,
    // A pale wash of the raffle's color for the page around the card and the accounts box.
    page: mix(numberColor, 0.92),
    box: mix(numberColor, 0.88),
    // Links and emphasis on the white card.
    accent: ensureContrast(numberColor, ["#ffffff"], 4.5),
    // A light header would blend into the white card: underline it in the raffle's color.
    headerBorder: luminance(background) > 0.8 ? `border-bottom:4px solid ${numberColor};` : "",
  };
}

export function render(c: Composed, raffleName: string, colors: ReturnType<typeof emailColors>): { text: string; html: string } {
  const text = [
    ...c.paragraphs.map((p) => p.replace(/\*\*/g, "")),
    ...(c.accounts?.length ? ["", "Puedes pagar en:", ...c.accounts.map((a) => `• ${a}`)] : []),
    ...(c.button ? ["", `${c.button.label}: ${c.button.url}`] : []),
    "",
    `— ${raffleName}`,
  ].join("\n");

  const para = (p: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1f1d26">${escapeHtml(p).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${colors.accent}">$1</strong>`)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:${colors.page};padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${colors.box}">
<div style="background:${colors.header};${colors.headerBorder}padding:18px 24px;color:${colors.headerText};font-size:18px;font-weight:bold">${escapeHtml(raffleName)}</div>
<div style="padding:24px">
${c.paragraphs.map(para).join("\n")}
${
  c.accounts?.length
    ? `<div style="margin:6px 0 16px;padding:12px 14px;background:${colors.box};border-radius:12px;font-size:14px;color:#1f1d26"><div style="font-weight:bold;margin-bottom:6px">Puedes pagar en:</div>${c.accounts
        .map((a) => `<div>${escapeHtml(a)}</div>`)
        .join("")}${(c.qrImages ?? [])
        .map(
          (q) =>
            `<div style="margin-top:10px;text-align:center"><img src="${escapeHtml(q.url)}" alt="QR ${escapeHtml(q.label)}" width="180" style="width:180px;max-width:100%;border-radius:8px;background:#fff"><div style="font-size:12px;color:#5a556d">Escanea para pagar con Bre-B</div></div>`,
        )
        .join("")}</div>`
    : ""
}
${
  c.button
    ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(c.button.url)}" style="display:inline-block;background:${colors.button};color:${colors.buttonText};text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:12px">${escapeHtml(c.button.label)}</a></p>`
    : ""
}
</div></div>
<p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#8a8577;text-align:center">Recibes este correo porque reservaste en esta rifa.</p>
</body></html>`;
  return { text, html };
}

/** Sends `event` to every buyer (by email) among `rows`. Never throws. */
export async function emailBuyers(raffleId: string, rows: BuyerRow[], event: BuyerEvent, origin: string | null): Promise<void> {
  try {
    const withEmail = rows.filter((r) => r.buyerEmail);
    if (withEmail.length === 0 || !mailEnabled()) return;

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        name: true,
        numberPrice: true,
        holdDays: true,
        drawDate: true,
        drawTime: true,
        publicToken: true,
        stageDeadlineDays: true,
        fullPayPerk: true,
        fullPayDiscount: true,
        accounts: { orderBy: { position: "asc" }, select: accountSelect },
        groups: { select: { id: true, label: true, price: true } },
        stages: true,
        themeBackground: true,
        themeNumberColor: true,
        themeTextColor: true,
        owner: { select: { contactEmail: true } },
      },
    });
    if (!raffle) return;
    const stageSettings = stageSettingsOf({
      stages: raffle.stages.map((s) => ({
        id: s.id,
        position: s.position,
        label: s.label,
        prize: s.prize,
        price: s.price,
        bonus: s.bonus,
        lottery: s.lottery,
        drawDate: s.drawDate ? s.drawDate.toISOString() : null,
        winnerValue: s.winnerValue,
        outcome: s.outcome === "won" || s.outcome === "house" ? s.outcome : null,
        winnerName: s.winnerName,
        drawnAt: s.drawnAt ? s.drawnAt.toISOString() : null,
      })),
      stageDeadlineDays: raffle.stageDeadlineDays,
      fullPayPerk: raffle.fullPayPerk === "discount" || raffle.fullPayPerk === "draw" ? raffle.fullPayPerk : "none",
      fullPayDiscount: raffle.fullPayDiscount,
    });
    const accounts = raffle.accounts.map((a) => accountLine(toAccountDTO(a)));
    // QR images of Bre-B llaves, as links the email client loads from the app (only with a public link).
    const qrImages =
      origin && raffle.publicToken
        ? raffle.accounts.filter((a) => a.hasQr).map((a) => ({ label: a.label, url: `${origin}${accountQrPath(a.id, raffle.publicToken)}` }))
        : [];

    const byEmail = new Map<string, BuyerRow[]>();
    for (const r of withEmail) {
      const key = r.buyerEmail!.trim().toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) ?? []), r]);
    }

    for (const [, mine] of byEmail) {
      const to = mine[0]!.buyerEmail!.trim();
      const hi = firstName(mine[0]!.buyerName) ? `Hola ${firstName(mine[0]!.buyerName)},` : "Hola,";
      const setIds = [...new Set(mine.map((r) => r.groupId).filter((g): g is string => g !== null))];
      const sets = raffle.groups.filter((g) => setIds.includes(g.id));
      const loose = mine.filter((r) => r.groupId === null).map((r) => r.value);
      const what = describeHoldings(
        sets.map((g) => g.label),
        loose,
      );
      const amount =
        sets.reduce((sum, g) => sum + g.price, 0) + mine.filter((r) => r.groupId === null).reduce((sum, r) => sum + loosePrice(r, raffle.numberPrice), 0);
      const key = mine.find((r) => r.holdToken)?.holdToken;
      const link = origin && key && raffle.publicToken ? `${origin}/p/${raffle.publicToken}/reserva/${key}` : null;
      const soldAt = mine.map((r) => r.soldAt).find(Boolean) ?? null;
      const deadline =
        soldAt && raffle.holdDays
          ? formatDate(new Date(holdDeadline(soldAt, raffle.holdDays, raffle.stages.length === 0 ? raffle.drawDate : null, raffle.drawTime)).toISOString())
          : null;
      const button = link ? { label: "Ver mi reserva", url: link } : undefined;

      let c: Composed;
      switch (event.kind) {
        case "reserved":
          c = {
            subject: `Reservaste ${what} · ${raffle.name}`,
            paragraphs: [
              hi,
              `Tu reserva de **${what}** quedó registrada.`,
              stageSettings
                ? `Valor: **${formatCurrency(amount)}**. Se paga por cuotas: para jugar el próximo sorteo paga al menos **${formatCurrency(standingOf([], stageSettings).due * mine.length)}**.`
                : `Total a pagar: **${formatCurrency(amount)}**.`,
              deadline
                ? `Tienes hasta el **${deadline}** para pagar; si no, la reserva se libera.`
                : "Paga cuanto antes para no perder tu reserva.",
              link ? "Cuando pagues, sube la foto del comprobante desde tu reserva:" : "Cuando pagues, envía el comprobante a quien te compartió la rifa.",
            ],
            accounts,
            qrImages,
            button: link ? { label: "Subir comprobante", url: link } : undefined,
          };
          break;
        case "receipt":
          c = {
            subject: `Recibimos tu comprobante · ${raffle.name}`,
            paragraphs: [hi, `Recibimos el comprobante de pago de **${what}**.`, "El organizador lo revisará y te avisaremos por este medio cuando lo confirme."],
            button,
          };
          break;
        case "approved":
          c = {
            subject: `Pago confirmado ✅ · ${raffle.name}`,
            paragraphs: [
              hi,
              `Tu pago de **${what}** fue **confirmado**${event.method ? ` (${PAYMENT_METHOD_LABEL[event.method]})` : ""}.`,
              stageSettings ? "Ya pagaste todas las cuotas: juegas en todos los sorteos." : "Ya estás participando. ¡Mucha suerte!",
            ],
            button,
          };
          break;
        case "installment": {
          const s = stageSettings!;
          const total = installmentCount(s.stages);
          const lines = mine.map((r) => {
            const quotas = (r.quotas ?? []).map((q) => ({ quota: q.quota, paidAt: q.paidAt.toISOString() }));
            return { r, paid: quotas.length, owed: amountRemaining(quotas, s.stages), standing: standingOf(quotas, s) };
          });
          const paid = lines[0]!.paid;
          const owed = lines.reduce((sum, l) => sum + l.owed, 0);
          const st = lines[0]!.standing;
          c = {
            subject: `Recibimos tu cuota ${paid} de ${total} · ${raffle.name}`,
            paragraphs: [
              hi,
              `Registramos tu pago por **${what}**: llevas **${paid} de ${total}** cuotas.`,
              st.stage && st.upToDate
                ? `Estás al día: juegas ${st.stage.label}.`
                : st.stage
                  ? `Para jugar ${st.stage.label} te falta pagar ${formatCurrency(st.due)}${st.lastDay ? ` hasta el ${st.lastDay}` : ""}.`
                  : "",
              owed > 0 ? `Te queda por pagar: **${formatCurrency(owed)}**.` : "",
            ].filter(Boolean),
            accounts: owed > 0 ? accounts : undefined,
            qrImages: owed > 0 ? qrImages : undefined,
            button,
          };
          break;
        }
        case "rejected":
          c = {
            subject: `Tu comprobante no fue aprobado · ${raffle.name}`,
            paragraphs: [
              hi,
              `El organizador revisó el comprobante que enviaste por **${what}** y **no lo pudo aprobar**.`,
              event.reason ? `Motivo: ${event.reason}` : "",
              deadline ? `Tu reserva sigue activa hasta el **${deadline}**.` : "Tu reserva sigue activa.",
              link ? "Puedes subir un comprobante nuevo desde tu reserva:" : "Envía un comprobante nuevo a quien te compartió la rifa.",
            ].filter(Boolean),
            accounts,
            qrImages,
            button: link ? { label: "Subir otro comprobante", url: link } : undefined,
          };
          break;
        case "released":
          c = {
            subject: `Tu reserva se liberó · ${raffle.name}`,
            paragraphs: [
              hi,
              event.why === "expired"
                ? `Pasó el plazo para pagar y tu reserva de **${what}** se liberó: ${mine.length === 1 && sets.length === 0 ? "el número vuelve" : "vuelven"} a estar disponible${mine.length === 1 && sets.length === 0 ? "" : "s"}.`
                : event.why === "stage"
                  ? `No se recibió a tiempo la cuota de **${what}**, así que se liberó.`
                  : `El organizador liberó tu reserva de **${what}**.`,
              "Si crees que es un error o ya pagaste, responde este correo o escríbele al organizador.",
            ],
          };
          break;
        case "won":
          c = {
            subject: `¡Ganaste! 🎉 · ${raffle.name}`,
            paragraphs: [
              hi,
              event.wins && event.wins.length > 0
                ? `En el sorteo salió el **${formatNumberValue(event.winnerValue)}** y ganaste: ${event.wins
                    .map((w) => `**${w.label}** con el ${formatNumberValue(w.value)}${w.prize ? ` (${w.prize})` : ""}`)
                    .join(", ")}.`
                : `En el sorteo${event.stageLabel ? ` de **${event.stageLabel}**` : ""} salió el **${formatNumberValue(event.winnerValue)}**: ¡es tuyo! Ganaste${event.prize ? ` **${event.prize}**` : " el premio"}.`,
              "El organizador se comunicará contigo para coordinar la entrega. Si no te escribe, responde este correo.",
            ],
            button,
          };
          break;
        case "result":
          c = {
            subject: `Resultado del sorteo${event.stageLabel ? ` · ${event.stageLabel}` : ""} · ${raffle.name}`,
            paragraphs: [
              hi,
              `En el sorteo${event.stageLabel ? ` de **${event.stageLabel}**` : ""} salió el **${formatNumberValue(event.winnerValue)}**.`,
              event.extras && event.extras.length > 0
                ? `Premios adicionales: ${event.extras.map((w) => `${w.label} ${formatNumberValue(w.value)}`).join(" · ")}.`
                : "",
              event.outcome === "won"
                ? "Esta vez no fue tu número."
                : event.outcome === "house"
                  ? "Ese número no estaba al día con sus cuotas, así que el premio queda en la casa."
                  : "Nadie tenía ese número, así que el premio queda en la casa.",
              event.more ? "Sigues participando en los próximos sorteos con el mismo número. ¡Mucha suerte!" : "¡Gracias por participar!",
            ].filter(Boolean),
          };
          break;
      }
      const { text, html } = render(c, raffle.name, emailColors(raffle));
      await sendMail({ to, subject: c.subject, text, html, replyTo: raffle.owner.contactEmail });
    }
  } catch (err) {
    console.error("[mail] buyer email failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * After a draw (closing a raffle with its winner, or a stage's result): "¡Ganaste!" to the winner and the result
 * to every other buyer who left an email. Fire-and-forget, like the rest.
 */
export async function emailDrawResult(
  raffleId: string,
  draw: {
    winnerValue: number;
    outcome: "won" | "house" | "nobody";
    prize: string | null;
    stageLabel?: string | null;
    more?: boolean;
    /** "Gana Más": the extra prizes; `won` ones go to their numbers' buyers. */
    extras?: (PrizeLine & { won: boolean })[];
  },
  origin: string | null,
): Promise<void> {
  try {
    if (!mailEnabled()) return;
    const rows = await prisma.raffleNumber.findMany({
      where: { raffleId, status: { not: "available" }, buyerEmail: { not: null } },
      select: buyerRowSelect,
    });
    const extras = draw.extras ?? [];
    const emailOf = (r: BuyerRow) => r.buyerEmail?.trim().toLowerCase() ?? "";
    // Every prize someone takes, by the buyer's email.
    const prizesByEmail = new Map<string, PrizeLine[]>();
    const award = (value: number, line: PrizeLine) => {
      const row = rows.find((r) => r.value === value);
      if (!row) return;
      prizesByEmail.set(emailOf(row), [...(prizesByEmail.get(emailOf(row)) ?? []), line]);
    };
    if (draw.outcome === "won") award(draw.winnerValue, { label: "Premio mayor", value: draw.winnerValue, prize: draw.prize });
    for (const e of extras) if (e.won) award(e.value, { label: e.label, value: e.value, prize: e.prize });

    for (const [email, lines] of prizesByEmail) {
      const mine = rows.filter((r) => emailOf(r) === email);
      const onlyMain = lines.length === 1 && lines[0]!.label === "Premio mayor" && extras.length === 0;
      await emailBuyers(
        raffleId,
        mine,
        { kind: "won", winnerValue: draw.winnerValue, prize: draw.prize, stageLabel: draw.stageLabel, ...(onlyMain ? {} : { wins: lines }) },
        origin,
      );
    }
    const others = rows.filter((r) => !prizesByEmail.has(emailOf(r)));
    if (others.length > 0) {
      await emailBuyers(
        raffleId,
        others,
        {
          kind: "result",
          winnerValue: draw.winnerValue,
          outcome: draw.outcome,
          stageLabel: draw.stageLabel,
          more: draw.more,
          extras: extras.map(({ label, value, prize }) => ({ label, value, prize })),
        },
        origin,
      );
    }
  } catch (err) {
    console.error("[mail] draw result email failed:", err instanceof Error ? err.message : err);
  }
}
