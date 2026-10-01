import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { formatNumberValue } from "@/lib/format";
import { groupStatus, makePricer } from "@/lib/groups";
import { numberInclude, toNumberDTO } from "@/lib/numberDto";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment";
import { salesBySeller } from "@/lib/sales";
import { toStageDTO } from "@/lib/stageDto";
import { accountLine, accountSelect, toAccountDTO } from "@/lib/accounts";
import { amountRemaining, collectedOn, installmentCount, stageSettingsOf } from "@/lib/stages";
import type { RaffleNumberDTO } from "@/lib/types";

/**
 * A raffle as an Excel workbook, for the organizer to settle accounts or keep a record:
 * Resumen, Números (one row each), Compradores, Conjuntos (when sold in sets), Vendedores and, for a raffle
 * by stages, Etapas and Cuotas. Money as numbers with a peso format (so Excel can add them up), dates in
 * Colombia time. Text typed by buyers is written as plain text cells, never as formulas.
 */

const MONEY = '"$" #,##0';
const DATE = "dd/mm/yyyy hh:mm";
const STATUS = { available: "Disponible", occupied: "Apartado / pendiente", paid: "Pagado" } as const;

/** Excel has no time zones: the Colombia wall-clock time, as a date Excel shows as-is. */
function bogota(date: Date | string | null): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(d.getTime() - 5 * 60 * 60 * 1000);
}

function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

interface Column {
  header: string;
  key: string;
  width: number;
  style?: Partial<ExcelJS.Style>;
}

function sheet(wb: ExcelJS.Workbook, name: string, columns: Column[], rows: Record<string, unknown>[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.style }));
  ws.addRows(rows);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FF241A02" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5C518" } };
  header.alignment = { vertical: "middle" };
  if (rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export async function buildRaffleWorkbook(raffleId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    include: {
      numbers: { include: numberInclude, orderBy: { value: "asc" } },
      groups: { orderBy: { position: "asc" } },
      stages: { orderBy: { position: "asc" } },
      accounts: { orderBy: { position: "asc" }, select: accountSelect },
    },
  });
  if (!raffle) return null;

  const numbers: RaffleNumberDTO[] = raffle.numbers.map(toNumberDTO);
  const priceOf = makePricer({ numberPrice: raffle.numberPrice, groups: raffle.groups, numbers });
  const stageSettings = stageSettingsOf({
    stages: raffle.stages.map(toStageDTO),
    stageDeadlineDays: raffle.stageDeadlineDays,
    fullPayPerk: raffle.fullPayPerk === "discount" || raffle.fullPayPerk === "draw" ? raffle.fullPayPerk : "none",
    fullPayDiscount: raffle.fullPayDiscount,
  });
  const groupLabel = new Map(raffle.groups.map((g) => [g.id, g.label]));
  const quotaCount = stageSettings ? installmentCount(stageSettings.stages) : 0;

  // Each number's share of the price. A set's price is split among its numbers in whole pesos that add up
  // exactly (25.000 over 3 numbers: 8.334 + 8.333 + 8.333), so the sheet's totals match the set price.
  const share = new Map<string, number>();
  for (const g of raffle.groups) {
    const members = numbers.filter((n) => n.groupId === g.id);
    const base = Math.floor(g.price / Math.max(1, members.length));
    const extra = g.price - base * members.length;
    members.forEach((n, i) => share.set(n.id, base + (i < extra ? 1 : 0)));
  }
  const priceOfOne = (n: RaffleNumberDTO) => share.get(n.id) ?? priceOf([n]);
  const paidOn = (n: RaffleNumberDTO) => (stageSettings ? collectedOn(n.quotas) : n.status === "paid" ? priceOfOne(n) : 0);
  const owedOn = (n: RaffleNumberDTO) =>
    n.status === "available" ? 0 : stageSettings ? amountRemaining(n.quotas, stageSettings.stages) : n.status === "paid" ? 0 : priceOfOne(n);
  const receipt = (n: RaffleNumberDTO) => (n.photoDataUrl ? "Sí" : n.receiptRejectedAt ? "Rechazado" : n.status === "available" ? "" : "No");

  const sold = numbers.filter((n) => n.status !== "available");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ibirifas";
  wb.created = new Date();

  // ---------- Resumen
  const collected = sold.reduce((sum, n) => sum + paidOn(n), 0);
  const pending = sold.reduce((sum, n) => sum + owedOn(n), 0);
  const summary: [string, unknown, string?][] = [
    ["Rifa", raffle.name],
    ["Premio", raffle.prizeLabel ?? ""],
    ["Lotería", raffle.lottery ?? ""],
    ["Fecha del sorteo", raffle.drawDate ? raffle.drawDate.toISOString().slice(0, 10) : "Por definir"],
    ["Estado", raffle.status === "closed" ? "Cerrada" : "Activa"],
    ...(raffle.winnerValue !== null ? ([["Número ganador", formatNumberValue(raffle.winnerValue)]] as [string, unknown][]) : []),
    ["Valor del número", raffle.numberPrice, MONEY],
    ...(stageSettings ? ([["Cuotas por número", quotaCount]] as [string, unknown][]) : []),
    ["Cantidad de números", raffle.totalNumbers],
    ["Vendidos o apartados", sold.length],
    ["Pagados", numbers.filter((n) => n.status === "paid").length],
    ["Disponibles", numbers.length - sold.length],
    ["Recaudado", collected, MONEY],
    ["Por cobrar", pending, MONEY],
    ["Cuentas de pago", raffle.accounts.map((a) => accountLine(toAccountDTO(a))).join(" · ")],
    ["Exportado el", bogota(new Date()), DATE],
  ];
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 24 }, { width: 46 }];
  for (const [label, value, fmt] of summary) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (fmt) row.getCell(2).numFmt = fmt;
    row.getCell(2).alignment = { horizontal: "left" };
  }

  // ---------- Números
  sheet(
    wb,
    "Números",
    [
      { header: "Número", key: "num", width: 9 },
      ...(raffle.groups.length ? [{ header: "Conjunto", key: "set", width: 10 }] : []),
      { header: "Estado", key: "status", width: 20 },
      { header: "Comprador", key: "buyer", width: 26 },
      { header: "Teléfono", key: "phone", width: 16 },
      { header: "Correo", key: "email", width: 26 },
      { header: "Origen", key: "origin", width: 12 },
      { header: "Vendido por", key: "seller", width: 20 },
      { header: "Fecha de venta", key: "soldAt", width: 17, style: { numFmt: DATE } },
      { header: "Método de pago", key: "method", width: 15 },
      ...(stageSettings ? [{ header: "Cuotas", key: "quotas", width: 9 }] : []),
      { header: "Valor", key: "price", width: 13, style: { numFmt: MONEY } },
      { header: "Pagado", key: "paid", width: 13, style: { numFmt: MONEY } },
      { header: "Debe", key: "owed", width: 13, style: { numFmt: MONEY } },
      { header: "Comprobante", key: "receipt", width: 13 },
      { header: "Titular que pagó", key: "payer", width: 24 },
      { header: "Notas", key: "notes", width: 24 },
    ],
    numbers.map((n) => ({
      num: formatNumberValue(n.value),
      set: n.groupId ? (groupLabel.get(n.groupId) ?? "") : "",
      status: STATUS[n.status],
      buyer: n.buyerName ?? "",
      phone: n.buyerPhone ?? "",
      email: n.buyerEmail ?? "",
      origin: n.status === "available" ? "" : n.online ? "En línea" : "Equipo",
      seller: n.soldByName ?? "",
      soldAt: bogota(n.soldAt),
      method: n.paymentMethod ? PAYMENT_METHOD_LABEL[n.paymentMethod] : "",
      quotas: stageSettings && n.status !== "available" ? `${n.quotas.length}/${quotaCount}` : "",
      price: stageSettings ? raffle.numberPrice : priceOfOne(n),
      paid: paidOn(n),
      owed: owedOn(n),
      receipt: receipt(n),
      payer: n.payerName ?? "",
      notes: n.notes ?? "",
    })),
  );

  // ---------- Compradores
  const buyers = new Map<string, { name: string; phone: string; email: string; nums: RaffleNumberDTO[] }>();
  for (const n of sold) {
    const name = n.buyerName?.trim() || "Sin nombre";
    const key = normalizeName(name);
    const b = buyers.get(key) ?? { name, phone: "", email: "", nums: [] };
    b.nums.push(n);
    if (!b.phone && n.buyerPhone) b.phone = n.buyerPhone;
    if (!b.email && n.buyerEmail) b.email = n.buyerEmail;
    buyers.set(key, b);
  }
  sheet(
    wb,
    "Compradores",
    [
      { header: "Comprador", key: "name", width: 26 },
      { header: "Teléfono", key: "phone", width: 16 },
      { header: "Correo", key: "email", width: 26 },
      { header: "Números", key: "nums", width: 30 },
      { header: "Cantidad", key: "count", width: 10 },
      { header: "Total", key: "total", width: 13, style: { numFmt: MONEY } },
      { header: "Pagado", key: "paid", width: 13, style: { numFmt: MONEY } },
      { header: "Debe", key: "owed", width: 13, style: { numFmt: MONEY } },
    ],
    [...buyers.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((b) => {
        const paid = b.nums.reduce((s, n) => s + paidOn(n), 0);
        const owed = b.nums.reduce((s, n) => s + owedOn(n), 0);
        return {
          name: b.name,
          phone: b.phone,
          email: b.email,
          nums: b.nums.map((n) => formatNumberValue(n.value)).join(", "),
          count: b.nums.length,
          total: paid + owed,
          paid,
          owed,
        };
      }),
  );

  // ---------- Conjuntos
  if (raffle.groups.length > 0) {
    sheet(
      wb,
      "Conjuntos",
      [
        { header: "Conjunto", key: "label", width: 10 },
        { header: "Números", key: "nums", width: 36 },
        { header: "Precio", key: "price", width: 13, style: { numFmt: MONEY } },
        { header: "Estado", key: "status", width: 20 },
        { header: "Comprador", key: "buyer", width: 26 },
        { header: "Teléfono", key: "phone", width: 16 },
      ],
      raffle.groups.map((g) => {
        const members = numbers.filter((n) => n.groupId === g.id);
        const first = members.find((n) => n.status !== "available");
        return {
          label: g.label,
          nums: members.map((n) => formatNumberValue(n.value)).join(", "),
          price: g.price,
          status: STATUS[groupStatus(members)],
          buyer: first?.buyerName ?? "",
          phone: first?.buyerPhone ?? "",
        };
      }),
    );
  }

  // ---------- Vendedores
  sheet(
    wb,
    "Vendedores",
    [
      { header: "Vendedor", key: "name", width: 26 },
      { header: "Números", key: "numbers", width: 10 },
      { header: "Conjuntos", key: "sets", width: 10 },
      { header: "Vendido", key: "sold", width: 13, style: { numFmt: MONEY } },
      { header: "Recaudado", key: "collected", width: 13, style: { numFmt: MONEY } },
      { header: "Por cobrar", key: "pending", width: 13, style: { numFmt: MONEY } },
    ],
    salesBySeller(numbers, (subset) => subset.reduce((sum, n) => sum + priceOfOne(n), 0), stageSettings).map((s) => ({ ...s })),
  );

  // ---------- Etapas y cuotas
  if (stageSettings) {
    sheet(
      wb,
      "Etapas",
      [
        { header: "Etapa", key: "label", width: 18 },
        { header: "Premio", key: "prize", width: 20 },
        { header: "Cuota", key: "price", width: 12, style: { numFmt: MONEY } },
        { header: "Fecha", key: "date", width: 12 },
        { header: "Lotería", key: "lottery", width: 18 },
        { header: "Salió", key: "winner", width: 8 },
        { header: "Resultado", key: "outcome", width: 16 },
        { header: "Ganador", key: "winnerName", width: 24 },
      ],
      raffle.stages.map((s) => ({
        label: s.bonus ? `${s.label} (extra)` : s.label,
        prize: s.prize,
        price: s.bonus ? null : s.price,
        date: s.drawDate ? s.drawDate.toISOString().slice(0, 10) : "",
        lottery: s.lottery ?? raffle.lottery ?? "",
        winner: s.winnerValue !== null ? formatNumberValue(s.winnerValue) : "",
        outcome: s.outcome === "won" ? "Ganó" : s.outcome === "house" ? "Quedó en la casa" : "Pendiente",
        winnerName: s.winnerName ?? "",
      })),
    );
    const quotas = await prisma.numberQuota.findMany({
      where: { raffleId },
      orderBy: [{ paidAt: "asc" }],
      include: { number: { select: { value: true, buyerName: true } } },
    });
    const byIds = [...new Set(quotas.map((q) => q.byId).filter((id): id is string => Boolean(id)))];
    const people = new Map(
      (await prisma.adminUser.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
    );
    sheet(
      wb,
      "Cuotas",
      [
        { header: "Fecha", key: "date", width: 17, style: { numFmt: DATE } },
        { header: "Número", key: "num", width: 9 },
        { header: "Comprador", key: "buyer", width: 26 },
        { header: "Cuota", key: "quota", width: 8 },
        { header: "Valor", key: "amount", width: 13, style: { numFmt: MONEY } },
        { header: "Método", key: "method", width: 14 },
        { header: "Cobró", key: "by", width: 20 },
      ],
      quotas.map((q) => ({
        date: bogota(q.paidAt),
        num: formatNumberValue(q.number.value),
        buyer: q.number.buyerName ?? "",
        quota: `${q.quota}/${quotaCount}`,
        amount: q.amount,
        method: PAYMENT_METHOD_LABEL[q.method as keyof typeof PAYMENT_METHOD_LABEL] ?? q.method,
        by: q.byId ? (people.get(q.byId) ?? "") : "",
      })),
    );
  }

  const safe = raffle.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rifa";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `rifa-${safe}-${day}.xlsx` };
}
