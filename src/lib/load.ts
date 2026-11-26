import { tx } from "./db";
import type { Account, Booking, PlanItem, Recurring } from "./types";

export interface AllData {
  accounts: Account[];
  recurring: Recurring[];
  plan: PlanItem[];
  bookings: Booking[];
  booked: Set<string>;
}

export async function loadAll(): Promise<AllData> {
  return tx(["accounts", "recurring", "plan", "bookings", "meta"], "readonly", async (t) => {
    const accounts = (await t.all<Account>("accounts")).sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
    const booked = new Set<string>();
    for (const [k] of await t.entries("meta")) if (String(k).startsWith("booked:")) booked.add(String(k).slice(7));
    return {
      accounts,
      recurring: await t.all<Recurring>("recurring"),
      plan: await t.all<PlanItem>("plan"),
      bookings: (await t.all<Booking>("bookings")).sort((a, b) => (b.date === a.date ? b.id - a.id : b.date.localeCompare(a.date))),
      booked,
    };
  });
}
