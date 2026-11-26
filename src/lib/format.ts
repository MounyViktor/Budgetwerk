const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const EUR0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const euro = (cents: number) => EUR.format(cents / 100);
export const euroShort = (cents: number) => (Math.abs(cents) >= 100000 ? EUR0.format(cents / 100) : EUR.format(cents / 100));

/**
 * Liest Beträge so, wie man sie auf dem iPhone tippt: "12,50", "1.250,00", "12.5", "-3".
 * Gibt Cent zurück oder null, wenn die Eingabe kein Betrag ist.
 */
export function parseEuro(input: string): number | null {
  let t = input.trim().replace(/[\s€]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

/** Cent als Eingabetext für ein Formularfeld, z. B. 125000 → "1250,00" */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function berlinParts(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // JJJJ-MM-TT
}

export const today = () => berlinParts();
export const currentMonth = () => today().slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
