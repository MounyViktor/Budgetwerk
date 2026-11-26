import { beforeEach, describe, expect, it } from "vitest";
import { monthBookings, monthSummary } from "../src/lib/budget";
import { resetForTests } from "../src/lib/db";
import { parseEuro } from "../src/lib/format";
import { loadAll } from "../src/lib/load";
import { bookMonth, executeSaving, saveAccount, savePlanItem, saveRecurring, spendOnPlan, transfer } from "../src/lib/store";
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

describe("Monatsrechnung", () => {
  const rec = (type: Recurring["type"], amount: number, active = true): Recurring =>
    ({ id: Math.random(), type, name: type, amount_cents: amount, account_id: 1, day: 31, category: "x", active });
  it("rechnet Einnahmen minus Fixkosten minus Plan", () => {
    const s = monthSummary([rec("einnahme", 300000), rec("fix", 100000), rec("fix", 5000, false)], [
      { id: 1, month: "2026-11", type: "ausgabe", name: "a", emoji: "", amount_cents: 40000, account_id: 1, target_account_id: null, done: false },
      { id: 2, month: "2026-11", type: "sparen", name: "s", emoji: "", amount_cents: 50000, account_id: 1, target_account_id: 2, done: false },
      { id: 3, month: "2026-12", type: "ausgabe", name: "x", emoji: "", amount_cents: 99999, account_id: 1, target_account_id: null, done: false },
    ], [{ id: 1, account_id: 1, date: "2026-11-02", amount_cents: -1234, note: "", kind: "plan", plan_id: 1 }], "2026-11");
    expect(s.free).toBe(200000);
    expect(s.rest).toBe(110000);
    expect(s.spentByPlan[1]).toBe(1234);
  });
  it("setzt den Buchungstag auf das Monatsende, wenn der Monat kürzer ist", () => {
    expect(monthBookings([rec("einnahme", 100)], "2026-02")[0].date).toBe("2026-02-28");
  });
});

describe("Buchungen", () => {
  beforeEach(resetForTests);
  it("bucht Monat, Sparrate und Ausgaben auf die Konten", async () => {
    const giro = await saveAccount({ name: "Giro", bank: "sparkasse", kind: "giro", balance_cents: 10000 });
    const spar = await saveAccount({ name: "Spar", bank: "ing", kind: "spar", balance_cents: 0 });
    await saveRecurring({ type: "einnahme", name: "Gehalt", amount_cents: 200000, account_id: giro, day: 28, category: "Gehalt", active: true });
    await saveRecurring({ type: "fix", name: "Miete", amount_cents: 80000, account_id: giro, day: 1, category: "Wohnen", active: true });
    await bookMonth("2026-11");
    await expect(bookMonth("2026-11")).rejects.toThrow();
    await savePlanItem({ month: "2026-11", type: "sparen", name: "Topf", emoji: "🐷", amount_cents: 30000, account_id: giro, target_account_id: spar, done: false });
    await savePlanItem({ month: "2026-11", type: "ausgabe", name: "Essen", emoji: "🛒", amount_cents: 20000, account_id: giro, target_account_id: null, done: false });
    let d = await loadAll();
    await executeSaving(d.plan.find((p) => p.type === "sparen")!);
    await spendOnPlan(d.plan.find((p) => p.type === "ausgabe")!, 4500, giro, "");
    await transfer(giro, spar, 500, "");
    d = await loadAll();
    expect(d.accounts.find((a) => a.id === giro)!.balance_cents).toBe(10000 + 200000 - 80000 - 30000 - 4500 - 500);
    expect(d.accounts.find((a) => a.id === spar)!.balance_cents).toBe(30500);
    expect(d.plan.find((p) => p.type === "sparen")!.done).toBe(true);
  });
});
