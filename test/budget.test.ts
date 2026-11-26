import { beforeEach, describe, expect, it } from "vitest";
import { budgetMonthOf, monthSummary, periodOf, recurringDate, yearlyFixed } from "../src/lib/budget";
import { resetForTests } from "../src/lib/db";
import { parseEuro } from "../src/lib/format";
import { loadAll } from "../src/lib/load";
import { executeSaving, saveAccount, savePlanItem, saveRecurring, saveSettings, spendOnPlan, syncRecurring, transfer } from "../src/lib/store";
import type { Recurring } from "../src/lib/types";

describe("parseEuro", () => {
  it("liest deutsche und englische Schreibweisen", () => {
    expect(parseEuro("12,50")).toBe(1250);
    expect(parseEuro("1.250,00")).toBe(125000);
    expect(parseEuro("1.250")).toBe(125000);
    expect(parseEuro("12.5")).toBe(1250);
    expect(parseEuro("-3")).toBe(-300);
    expect(parseEuro("abc")).toBeNull();
  });
});

const rec = (type: Recurring["type"], amount: number, extra: Partial<Recurring> = {}): Recurring =>
  ({ id: Math.floor(Math.random() * 1e9), type, name: type, amount_cents: amount, account_id: 1, day: 1, category: "x", active: true, ...extra });

describe("Budgetmonat", () => {
  it("zählt das Gehalt ab dem Gehaltstag für den Folgemonat", () => {
    expect(budgetMonthOf("2026-11-26", 26)).toBe("2026-12");
    expect(budgetMonthOf("2026-11-25", 26)).toBe("2026-11");
    expect(budgetMonthOf("2026-11-26", null)).toBe("2026-11");
    expect(periodOf("2026-12", 26)).toEqual({ start: "2026-11-26", end: "2026-12-25" });
    expect(recurringDate(rec("einnahme", 1, { day: 26 }), "2026-12", 26)).toBe("2026-11-26");
    expect(recurringDate(rec("fix", 1, { day: 3 }), "2026-12", 26)).toBe("2026-12-03");
  });
  it("bucht jährliche Kosten nur in ihrem Monat", () => {
    const r = rec("fix", 1, { interval: "jahr", month_of_year: 3, day: 15 });
    expect(recurringDate(r, "2027-03", null)).toBe("2027-03-15");
    expect(recurringDate(r, "2027-04", null)).toBeNull();
  });
});

describe("Monatsrechnung", () => {
  it("rechnet jährliche Fixkosten mit 1/12 ein", () => {
    const r = [rec("einnahme", 300000), rec("fix", 100000), rec("fix", 60000, { interval: "jahr", month_of_year: 1 }), rec("fix", 5000, { active: false })];
    const s = monthSummary(r, [
      { id: 1, month: "2026-11", type: "ausgabe", name: "a", emoji: "", amount_cents: 40000, account_id: 1, target_account_id: null, done: false },
    ], [{ id: 1, account_id: 1, date: "2026-11-02", amount_cents: -1234, note: "", kind: "plan", plan_id: 1 }], "2026-11");
    expect(s.fixed).toBe(105000);
    expect(s.free).toBe(195000);
    expect(s.rest).toBe(155000);
    expect(s.spentByPlan[1]).toBe(1234);
    expect(yearlyFixed(r)).toEqual({ monthly: 1200000, yearly: 60000, total: 1260000 });
  });
});

describe("Buchungen", () => {
  beforeEach(resetForTests);
  it("bucht ab dem Start automatisch, ohne das schon erhaltene Gehalt doppelt zu zählen", async () => {
    const giro = await saveAccount({ name: "Giro", bank: "sparkasse", kind: "giro", balance_cents: 250000 });
    const spar = await saveAccount({ name: "Spar", bank: "ing", kind: "spar", balance_cents: 0 });
    await saveRecurring({ type: "einnahme", name: "Gehalt", amount_cents: 200000, account_id: giro, day: 26, category: "Gehalt", active: true });
    await saveRecurring({ type: "fix", name: "Miete", amount_cents: 80000, account_id: giro, day: 1, category: "Wohnen", active: true });
    await saveRecurring({ type: "fix", name: "Kfz", amount_cents: 36000, account_id: giro, day: 10, category: "Mobilität", active: true, interval: "jahr", month_of_year: 1 });
    expect(await syncRecurring("2026-11-26")).toBe(0); // Start: Gehalt vom 26.11. steckt schon im Kontostand
    expect((await loadAll()).month).toBe("2026-12");
    expect(await syncRecurring("2026-12-02")).toBe(1); // Miete 1.12.
    expect(await syncRecurring("2026-12-02")).toBe(0); // nicht doppelt
    expect(await syncRecurring("2027-01-12")).toBe(3); // Gehalt 26.12., Miete 1.1., Kfz 10.1.
    let d = await loadAll();
    expect(d.accounts.find((a) => a.id === giro)!.balance_cents).toBe(250000 - 80000 + 200000 - 80000 - 36000);

    await saveSettings({ payday: null });
    await savePlanItem({ month: "2027-01", type: "sparen", name: "Topf", emoji: "🐷", amount_cents: 30000, account_id: giro, target_account_id: spar, done: false });
    await savePlanItem({ month: "2027-01", type: "ausgabe", name: "Essen", emoji: "🛒", amount_cents: 20000, account_id: giro, target_account_id: null, done: false });
    d = await loadAll();
    await executeSaving(d.plan.find((p) => p.type === "sparen")!);
    await spendOnPlan(d.plan.find((p) => p.type === "ausgabe")!, 4500, giro, "");
    await transfer(giro, spar, 500, "");
    d = await loadAll();
    expect(d.accounts.find((a) => a.id === spar)!.balance_cents).toBe(30500);
    expect(d.plan.find((p) => p.type === "sparen")!.done).toBe(true);
  });
});
