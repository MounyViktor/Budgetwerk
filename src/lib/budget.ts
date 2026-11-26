// Reine Rechenregeln ohne Speicherzugriff. Getestet in test/budget.test.ts.
import { addMonths } from "./format";
import type { Account, Booking, PlanItem, Recurring, Settings } from "./types";

export const isYearly = (r: Recurring) => r.interval === "jahr";
/** Monatlicher Anteil: jährliche Kosten zählen mit 1/12 in jeden Monat. */
export const monthlyShare = (r: Recurring) => (isYearly(r) ? Math.round(r.amount_cents / 12) : r.amount_cents);
export const yearlyAmount = (r: Recurring) => (isYearly(r) ? r.amount_cents : r.amount_cents * 12);

// --- Budgetmonat ---

/**
 * Gehaltstag, mit dem der Budgetmonat beginnt. Ohne eigene Einstellung: der Tag des ersten Gehalts,
 * wenn er in der zweiten Monatshälfte liegt (dann ist das Gehalt fürs nächste Monat gedacht).
 */
export function effectivePayday(settings: Settings, recurring: Recurring[]): number | null {
  if (settings.payday !== undefined) return settings.payday;
  const salary = recurring.filter((r) => r.active && r.type === "einnahme" && !isYearly(r)).sort((a, b) => b.amount_cents - a.amount_cents)[0];
  return salary && salary.day >= 15 ? salary.day : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dayIn = (month: string, day: number) => `${month}-${pad(Math.min(day, lastDay(month)))}`;

/** Zu welchem Budgetmonat ein Tag gehört. Mit Gehaltstag 26: der 26.11. gehört schon zum Dezember. */
export function budgetMonthOf(date: string, payday: number | null): string {
  const m = date.slice(0, 7);
  const d = Number(date.slice(8, 10));
  return payday && d >= Math.min(payday, lastDay(m)) ? addMonths(m, 1) : m;
}

/** Erster und letzter Tag eines Budgetmonats */
export function periodOf(month: string, payday: number | null): { start: string; end: string } {
  if (!payday) return { start: `${month}-01`, end: dayIn(month, 31) };
  const start = dayIn(addMonths(month, -1), payday);
  const next = new Date(`${dayIn(month, payday)}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() - 1);
  return { start, end: next.toISOString().slice(0, 10) };
}

/** Tag, an dem ein Eintrag im Budgetmonat fällig ist. Jährliche Einträge nur in ihrem Monat, sonst null. */
export function recurringDate(r: Recurring, month: string, payday: number | null): string | null {
  const cal = payday && r.day >= payday ? addMonths(month, -1) : month;
  if (isYearly(r) && Number(cal.slice(5, 7)) !== (r.month_of_year ?? 1)) return null;
  return dayIn(cal, r.day);
}

export const recKey = (month: string, id: number) => `rec:${month}:${id}`;

/** Fällige, noch nicht gebuchte Einträge eines Budgetmonats */
export function dueRecurring(recurring: Recurring[], month: string, payday: number | null, today: string, startDate: string, done: Set<string>) {
  const out: { r: Recurring; date: string }[] = [];
  for (const r of recurring) {
    if (!r.active) continue;
    const date = recurringDate(r, month, payday);
    if (!date || date > today || date <= startDate || done.has(recKey(month, r.id))) continue;
    out.push({ r, date });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type RecStatus = { kind: "gebucht" | "kontostand" | "faellig" | "nicht"; date: string | null };

export function recurringStatus(r: Recurring, month: string, payday: number | null, startDate: string | null, done: Set<string>): RecStatus {
  const date = recurringDate(r, month, payday);
  if (!date) return { kind: "nicht", date: null };
  if (done.has(recKey(month, r.id))) return { kind: "gebucht", date };
  if (startDate && date <= startDate) return { kind: "kontostand", date };
  return { kind: "faellig", date };
}

// --- Monatsrechnung ---

export interface MonthSummary {
  income: number;
  /** Monatliche Fixkosten plus 1/12 der jährlichen */
  fixed: number;
  fixedYearlyShare: number;
  free: number;
  plannedSpend: number;
  plannedSave: number;
  rest: number;
  spentByPlan: Record<number, number>;
  spentTotal: number;
}

export function monthSummary(recurring: Recurring[], plan: PlanItem[], bookings: Booking[], month: string): MonthSummary {
  const active = recurring.filter((r) => r.active);
  const income = active.filter((r) => r.type === "einnahme").reduce((a, r) => a + monthlyShare(r), 0);
  const fixed = active.filter((r) => r.type === "fix").reduce((a, r) => a + monthlyShare(r), 0);
  const fixedYearlyShare = active.filter((r) => r.type === "fix" && isYearly(r)).reduce((a, r) => a + monthlyShare(r), 0);
  const items = plan.filter((p) => p.month === month);
  const plannedSpend = items.filter((p) => p.type === "ausgabe").reduce((a, p) => a + p.amount_cents, 0);
  const plannedSave = items.filter((p) => p.type === "sparen").reduce((a, p) => a + p.amount_cents, 0);
  const ids = new Set(items.map((p) => p.id));
  const spentByPlan: Record<number, number> = {};
  let spentTotal = 0;
  for (const b of bookings) {
    if (b.kind !== "plan" || b.plan_id == null || !ids.has(b.plan_id)) continue;
    spentByPlan[b.plan_id] = (spentByPlan[b.plan_id] ?? 0) - b.amount_cents;
    spentTotal -= b.amount_cents;
  }
  const free = income - fixed;
  return { income, fixed, fixedYearlyShare, free, plannedSpend, plannedSave, rest: free - plannedSpend - plannedSave, spentByPlan, spentTotal };
}

/** Fixkosten aufs Jahr gerechnet */
export function yearlyFixed(recurring: Recurring[]) {
  const fix = recurring.filter((r) => r.active && r.type === "fix");
  const monthly = fix.filter((r) => !isYearly(r)).reduce((a, r) => a + r.amount_cents * 12, 0);
  const yearly = fix.filter(isYearly).reduce((a, r) => a + r.amount_cents, 0);
  return { monthly, yearly, total: monthly + yearly };
}

export function netWorth(accounts: Account[]): number {
  return accounts.reduce((a, x) => a + x.balance_cents, 0);
}

export function totalsByKind(accounts: Account[]) {
  const sum = (k: Account["kind"]) => accounts.filter((a) => a.kind === k).reduce((s, a) => s + a.balance_cents, 0);
  return { giro: sum("giro"), spar: sum("spar"), kredit: sum("kredit"), bargeld: sum("bargeld") };
}

export const ratio = (part: number, whole: number) => (whole <= 0 ? 0 : Math.max(0, Math.min(1, part / whole)));
