const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateFormatter.format(date);
}

// A draw date is a calendar day, not an instant: the form stores the picked
// day as UTC midnight, so it must be read back in UTC too — formatting it in
// local time shows the previous day anywhere west of UTC (e.g. Colombia).
const drawDateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDrawDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return drawDateFormatter.format(date);
}

/** "21:00" → "9:00 p. m." (the draw time, Colombian style); "" for no time. */
export function formatDrawTime(drawTime: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})$/.exec(drawTime ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "a. m." : "p. m."}`;
}

/** The time of day of a moment in Colombia: "9:00 p. m." */
export function formatTimeOfDay(iso: string): string {
  return formatDrawTime(new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(11, 16));
}

/** "5 de octubre de 2026 a las 9:00 p. m." (just the date without a time). */
export function formatDrawWhen(drawDate: string, drawTime?: string | null): string {
  const time = formatDrawTime(drawTime);
  return time ? `${formatDrawDate(drawDate)} a las ${time}` : formatDrawDate(drawDate);
}

export function formatNumberValue(value: number): string {
  return value.toString().padStart(2, "0");
}
