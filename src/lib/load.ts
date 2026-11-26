import { budgetMonthOf, effectivePayday } from "./budget";
import { tx } from "./db";
import { today } from "./format";
import type { Account, Booking, PlanItem, Recurring, Settings } from "./types";

export interface AllData {
  accounts: Account[];
  recurring: Recurring[];
  plan: PlanItem[];
  bookings: Booking[];
  settings: Settings;
  /** Gehaltstag, mit dem der Budgetmonat beginnt (null = Kalendermonat) */
  payday: number | null;
  /** Aktueller Budgetmonat */
  month: string;
  /** Erledigte Einträge (Schlüssel "rec:Monat:id") */
  done: Set<string>;
}

export async function loadAll(): Promise<AllData> {
  return tx(["accounts", "recurring", "plan", "bookings", "meta"], "readonly", async (t) => {
    const accounts = (await t.all<Account>("accounts")).sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
    const done = new Set<string>();
    for (const [k] of await t.entries("meta")) done.add(String(k));
    const recurring = await t.all<Recurring>("recurring");
    const settings = (await t.get<Settings>("meta", "settings")) ?? {};
    const payday = effectivePayday(settings, recurring);
    return {
      accounts,
      recurring,
      plan: await t.all<PlanItem>("plan"),
      bookings: (await t.all<Booking>("bookings")).sort((a, b) => (b.date === a.date ? b.id - a.id : b.date.localeCompare(a.date))),
      settings,
      payday,
      month: budgetMonthOf(today(), payday),
      done,
    };
  });
}
