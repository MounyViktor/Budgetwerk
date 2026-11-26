// Reine Rechenregeln ohne Speicherzugriff. Getestet in test/budget.test.ts.
import type { Account, Booking, PlanItem, Recurring } from "./types";

export interface MonthSummary {
  income: number;
  fixed: number;
  /** Einnahmen minus Fixkosten */
  free: number;
  plannedSpend: number;
  plannedSave: number;
  /** Frei verfügbar minus alles Verplante. Negativ heißt: überplant. */
  rest: number;
  /** Tatsächlich ausgegeben je Planposten */
  spentByPlan: Record<number, number>;
  spentTotal: number;
}

export function monthSummary(recurring: Recurring[], plan: PlanItem[], bookings: Booking[], month: string): MonthSummary {
  const active = recurring.filter((r) => r.active);
  const income = active.filter((r) => r.type === "einnahme").reduce((a, r) => a + r.amount_cents, 0);
  const fixed = active.filter((r) => r.type === "fix").reduce((a, r) => a + r.amount_cents, 0);
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
  return { income, fixed, free, plannedSpend, plannedSave, rest: free - plannedSpend - plannedSave, spentByPlan, spentTotal };
}

export function netWorth(accounts: Account[]): number {
  return accounts.reduce((a, x) => a + x.balance_cents, 0);
}

export function totalsByKind(accounts: Account[]) {
  const sum = (k: Account["kind"]) => accounts.filter((a) => a.kind === k).reduce((s, a) => s + a.balance_cents, 0);
  return { giro: sum("giro"), spar: sum("spar"), kredit: sum("kredit"), bargeld: sum("bargeld") };
}

/** Buchungen, die "Monat buchen" anlegt: jedes aktive Gehalt als Eingang, jede Fixkosten als Abgang. */
export function monthBookings(recurring: Recurring[], month: string): Omit<Booking, "id">[] {
  return recurring
    .filter((r) => r.active)
    .sort((a, b) => a.day - b.day)
    .map((r) => ({
      account_id: r.account_id,
      date: `${month}-${String(Math.min(r.day, lastDay(month))).padStart(2, "0")}`,
      amount_cents: r.type === "einnahme" ? r.amount_cents : -r.amount_cents,
      note: r.name,
      kind: r.type === "einnahme" ? "gehalt" : "fix",
      plan_id: null,
      month,
    }));
}

function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Anteil 0..1, sicher gegen Division durch 0 */
export const ratio = (part: number, whole: number) => (whole <= 0 ? 0 : Math.max(0, Math.min(1, part / whole)));
