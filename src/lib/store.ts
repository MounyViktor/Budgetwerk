// Alle Schreibzugriffe. Jede Buchung ändert den Kontostand in derselben Transaktion.
import { budgetMonthOf, dueRecurring, effectivePayday, recKey } from "./budget";
import { STORES, tx, type Tx } from "./db";
import { addMonths, today } from "./format";
import { nextDate } from "./tasks";
import type { Account, Backup, Booking, PlanItem, Project, Recurring, Settings, Task, TxKind } from "./types";

// --- Konten ---

export async function saveAccount(a: Omit<Account, "id" | "created_at"> & { id?: number }): Promise<number> {
  if (!a.name.trim()) throw new Error("Bitte einen Namen für das Konto eingeben.");
  return tx(["accounts", "bookings"], "readwrite", async (t) => {
    if (a.id) {
      const old = await t.get<Account>("accounts", a.id);
      if (!old) throw new Error("Konto nicht gefunden.");
      const diff = a.balance_cents - old.balance_cents;
      await t.put("accounts", { ...old, ...a, balance_cents: old.balance_cents });
      if (diff !== 0) await book(t, a.id, diff, "Kontostand angepasst", "korrektur");
      return a.id;
    }
    const all = await t.all<Account>("accounts");
    const { id: _ignore, ...rest } = a;
    const id = Number(await t.add("accounts", { ...rest, balance_cents: 0, created_at: new Date().toISOString(), order: all.length }));
    if (a.balance_cents !== 0) await book(t, id, a.balance_cents, "Startguthaben", "korrektur");
    return id;
  });
}

export async function deleteAccount(id: number) {
  await tx(["accounts", "bookings", "recurring", "plan"], "readwrite", async (t) => {
    for (const b of await t.byIndex<Booking>("bookings", "account_id", id)) await t.delete("bookings", b.id);
    for (const r of await t.all<Recurring>("recurring")) if (r.account_id === id) await t.delete("recurring", r.id);
    for (const p of await t.all<PlanItem>("plan")) {
      if (p.account_id === id || p.target_account_id === id) await t.put("plan", { ...p, account_id: p.account_id === id ? null : p.account_id, target_account_id: p.target_account_id === id ? null : p.target_account_id });
    }
    await t.delete("accounts", id);
  });
}

async function book(t: Tx, account_id: number, amount_cents: number, note: string, kind: TxKind, extra: Partial<Booking> = {}) {
  const acc = await t.get<Account>("accounts", account_id);
  if (!acc) throw new Error("Konto nicht gefunden.");
  await t.put("accounts", { ...acc, balance_cents: acc.balance_cents + amount_cents });
  await t.add("bookings", { account_id, amount_cents, note, kind, date: today(), plan_id: null, month: null, ...extra });
}

// --- Buchungen ---

export async function addBooking(account_id: number, amount_cents: number, note: string, kind: TxKind, extra: Partial<Booking> = {}) {
  if (!amount_cents) throw new Error("Bitte einen Betrag eingeben.");
  await tx(["accounts", "bookings"], "readwrite", (t) => book(t, account_id, amount_cents, note, kind, extra));
}

export async function transfer(from: number, to: number, amount_cents: number, note: string) {
  if (from === to) throw new Error("Bitte zwei verschiedene Konten wählen.");
  if (amount_cents <= 0) throw new Error("Bitte einen Betrag über 0 eingeben.");
  await tx(["accounts", "bookings"], "readwrite", async (t) => {
    await book(t, from, -amount_cents, note || "Umbuchung", "umbuchung");
    await book(t, to, amount_cents, note || "Umbuchung", "umbuchung");
  });
}

/** Löscht eine Buchung und rechnet den Kontostand zurück. */
export async function deleteBooking(id: number) {
  await tx(["accounts", "bookings"], "readwrite", async (t) => {
    const b = await t.get<Booking>("bookings", id);
    if (!b) return;
    const acc = await t.get<Account>("accounts", b.account_id);
    if (acc) await t.put("accounts", { ...acc, balance_cents: acc.balance_cents - b.amount_cents });
    await t.delete("bookings", id);
  });
}

// --- Einnahmen und Fixkosten ---

export async function saveRecurring(r: Omit<Recurring, "id"> & { id?: number }) {
  if (!r.name.trim()) throw new Error("Bitte eine Bezeichnung eingeben.");
  if (r.amount_cents <= 0) throw new Error("Bitte einen Betrag über 0 eingeben.");
  if (!r.account_id) throw new Error("Bitte ein Konto wählen.");
  await tx(["recurring"], "readwrite", async (t) => {
    if (r.id) await t.put("recurring", r);
    else { const { id: _i, ...rest } = r; await t.add("recurring", rest); }
  });
}

export async function deleteRecurring(id: number) {
  await tx(["recurring"], "readwrite", (t) => t.delete("recurring", id));
}

// --- Einstellungen und automatische Buchungen ---

export async function loadSettings(): Promise<Settings> {
  return tx(["meta"], "readonly", async (t) => ((await t.get<Settings>("meta", "settings")) ?? {}));
}

export async function saveSettings(patch: Partial<Settings>) {
  await tx(["meta"], "readwrite", async (t) => {
    const old = (await t.get<Settings>("meta", "settings")) ?? {};
    await t.put("meta", { ...old, ...patch }, "settings");
  });
}

/**
 * Bucht Gehalt und Fixkosten, sobald sie fällig sind. Beim ersten Mal wird nur das Startdatum gesetzt:
 * Alles bis heute steckt schon im eingetragenen Kontostand und wird nicht nachgebucht.
 */
export async function syncRecurring(now = today()): Promise<number> {
  const s = await loadSettings();
  if (!s.start_date) { await saveSettings({ start_date: now }); return 0; }
  const startDate = s.start_date;
  return tx(["accounts", "bookings", "recurring", "meta"], "readwrite", async (t) => {
    const recurring = await t.all<Recurring>("recurring");
    const payday = effectivePayday(s, recurring);
    const done = new Set<string>();
    for (const [k] of await t.entries("meta")) done.add(String(k));
    let n = 0;
    let month = budgetMonthOf(startDate, payday);
    const last = budgetMonthOf(now, payday);
    for (let i = 0; i < 36 && month <= last; i++, month = addMonths(month, 1)) {
      if (done.has(`booked:${month}`)) continue; // ältere Version: ganzer Monat schon gebucht
      for (const { r, date } of dueRecurring(recurring, month, payday, now, startDate, done)) {
        const acc = await t.get<Account>("accounts", r.account_id);
        if (!acc) continue;
        const amount = r.type === "einnahme" ? r.amount_cents : -r.amount_cents;
        await t.put("accounts", { ...acc, balance_cents: acc.balance_cents + amount });
        await t.add("bookings", { account_id: r.account_id, date, amount_cents: amount, note: r.name, kind: r.type === "einnahme" ? "gehalt" : "fix", plan_id: null, month });
        await t.put("meta", date, recKey(month, r.id));
        n++;
      }
    }
    return n;
  });
}

/** Einen Eintrag nachträglich buchen, z. B. das Gehalt, das beim Start noch nicht im Kontostand war. */
export async function bookRecurringNow(r: Recurring, month: string, date: string) {
  await tx(["accounts", "bookings", "meta"], "readwrite", async (t) => {
    if (await t.get("meta", recKey(month, r.id))) throw new Error("Schon gebucht.");
    const acc = await t.get<Account>("accounts", r.account_id);
    if (!acc) throw new Error("Konto nicht gefunden.");
    const amount = r.type === "einnahme" ? r.amount_cents : -r.amount_cents;
    await t.put("accounts", { ...acc, balance_cents: acc.balance_cents + amount });
    await t.add("bookings", { account_id: r.account_id, date, amount_cents: amount, note: r.name, kind: r.type === "einnahme" ? "gehalt" : "fix", plan_id: null, month });
    await t.put("meta", date, recKey(month, r.id));
  });
}

// --- Monatsplan ---

export async function savePlanItem(p: Omit<PlanItem, "id"> & { id?: number }) {
  if (!p.name.trim()) throw new Error("Bitte eine Bezeichnung eingeben.");
  if (p.amount_cents <= 0) throw new Error("Bitte einen Betrag über 0 eingeben.");
  if (p.type === "sparen" && !p.target_account_id) throw new Error("Bitte ein Sparkonto wählen.");
  await tx(["plan"], "readwrite", async (t) => {
    if (p.id) await t.put("plan", p);
    else { const { id: _i, ...rest } = p; await t.add("plan", rest); }
  });
}

export async function deletePlanItem(id: number) {
  await tx(["plan", "bookings"], "readwrite", async (t) => {
    // Buchungen bleiben, sie verlieren nur die Zuordnung zum Posten.
    for (const b of await t.byIndex<Booking>("bookings", "plan_id", id)) await t.put("bookings", { ...b, plan_id: null, kind: "auszahlung" });
    await t.delete("plan", id);
  });
}

/** Ausgabe zu einem Planposten erfassen: verringert das Quellkonto. */
export async function spendOnPlan(item: PlanItem, amount_cents: number, account_id: number, note: string) {
  if (amount_cents <= 0) throw new Error("Bitte einen Betrag über 0 eingeben.");
  await addBooking(account_id, -amount_cents, note || item.name, "plan", { plan_id: item.id, month: item.month });
}

/** Sparrate umbuchen: vom Quellkonto aufs Sparkonto. */
export async function executeSaving(item: PlanItem) {
  if (item.done) throw new Error("Diese Sparrate ist schon umgebucht.");
  if (!item.target_account_id) throw new Error("Bitte zuerst ein Sparkonto wählen.");
  await tx(["accounts", "bookings", "plan"], "readwrite", async (t) => {
    if (item.account_id) await book(t, item.account_id, -item.amount_cents, `Sparen: ${item.name}`, "sparen", { month: item.month });
    await book(t, item.target_account_id!, item.amount_cents, `Sparen: ${item.name}`, "sparen", { month: item.month });
    await t.put("plan", { ...item, done: true });
  });
}

/** Übernimmt alle Posten des Vormonats in einen leeren Monat. */
export async function copyPlan(fromMonth: string, toMonth: string): Promise<number> {
  return tx(["plan"], "readwrite", async (t) => {
    const items = await t.all<PlanItem>("plan");
    if (items.some((p) => p.month === toMonth)) throw new Error("Dieser Monat hat schon Posten.");
    const src = items.filter((p) => p.month === fromMonth);
    if (!src.length) throw new Error("Im Vormonat gibt es keine Posten.");
    for (const { id: _i, ...p } of src) await t.add("plan", { ...p, month: toMonth, done: false });
    return src.length;
  });
}

// --- Aufgaben ---

export type NewTask = Omit<Task, "id" | "created_at" | "done" | "completed_at" | "focus_min"> & Partial<Pick<Task, "id" | "done" | "completed_at" | "focus_min" | "created_at">>;

export async function saveTask(task: NewTask): Promise<number> {
  if (!task.title.trim()) throw new Error("Bitte einen Titel eingeben.");
  if (task.repeat !== "nie" && !task.date) throw new Error("Für eine Wiederholung braucht die Aufgabe ein Datum.");
  return tx(["tasks"], "readwrite", async (t) => {
    const full = { done: false, completed_at: null, focus_min: 0, created_at: new Date().toISOString(), ...task, title: task.title.trim() };
    if (task.id) { await t.put("tasks", full); return task.id; }
    const { id: _i, ...rest } = full;
    return Number(await t.add("tasks", rest));
  });
}

export async function deleteTask(id: number) {
  await tx(["tasks"], "readwrite", (t) => t.delete("tasks", id));
}

/**
 * Abhaken. Bei Wiederholungen wird die erledigte Aufgabe abgelegt und gleich die nächste angelegt.
 * Gibt das Datum der nächsten Wiederholung zurück.
 */
export async function toggleTask(id: number): Promise<string | null> {
  return tx(["tasks"], "readwrite", async (t) => {
    const task = await t.get<Task>("tasks", id);
    if (!task) return null;
    if (task.done) { await t.put("tasks", { ...task, done: false, completed_at: null }); return null; }
    await t.put("tasks", { ...task, done: true, completed_at: new Date().toISOString() });
    const next = task.date ? nextDate(task.date, task.repeat) : null;
    if (next) {
      const { id: _i, ...rest } = task;
      await t.add("tasks", { ...rest, date: next, done: false, completed_at: null, focus_min: 0, subtasks: task.subtasks.map((x) => ({ ...x, done: false })), created_at: new Date().toISOString() });
    }
    return next;
  });
}

export async function patchTask(id: number, patch: Partial<Task>) {
  await tx(["tasks"], "readwrite", async (t) => {
    const task = await t.get<Task>("tasks", id);
    if (!task) throw new Error("Aufgabe nicht gefunden.");
    await t.put("tasks", { ...task, ...patch, id });
  });
}

/** Mehrere Aufgaben auf einen Tag schieben, z. B. alles Überfällige auf heute. */
export async function moveTasks(ids: number[], date: string) {
  await tx(["tasks"], "readwrite", async (t) => {
    for (const id of ids) { const task = await t.get<Task>("tasks", id); if (task) await t.put("tasks", { ...task, date }); }
  });
}

export async function clearDone(): Promise<number> {
  return tx(["tasks"], "readwrite", async (t) => {
    const done = (await t.all<Task>("tasks")).filter((x) => x.done);
    for (const x of done) await t.delete("tasks", x.id);
    return done.length;
  });
}

export async function saveProject(p: Omit<Project, "id"> & { id?: number }): Promise<number> {
  if (!p.name.trim()) throw new Error("Bitte einen Namen eingeben.");
  return tx(["projects"], "readwrite", async (t) => {
    if (p.id) { await t.put("projects", p); return p.id; }
    const { id: _i, ...rest } = p;
    return Number(await t.add("projects", { ...rest, order: (await t.all("projects")).length }));
  });
}

export async function deleteProject(id: number) {
  await tx(["projects", "tasks"], "readwrite", async (t) => {
    for (const x of await t.all<Task>("tasks")) if (x.project_id === id) await t.put("tasks", { ...x, project_id: null });
    await t.delete("projects", id);
  });
}

export async function loadTasks(): Promise<{ tasks: Task[]; projects: Project[] }> {
  return tx(["tasks", "projects"], "readonly", async (t) => ({
    tasks: await t.all<Task>("tasks"),
    projects: (await t.all<Project>("projects")).sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)),
  }));
}

/** Findet ein Projekt per Name (für "#name" in der Schnelleingabe) oder legt es an. */
export async function projectByName(name: string): Promise<number> {
  const { projects } = await loadTasks();
  const hit = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit.id;
  const colors = ["#8C6CFF", "#3EF0B1", "#FF6B8B", "#FFC857", "#4AA8FF", "#FF8A3D"];
  return saveProject({ name, emoji: "📁", color: colors[projects.length % colors.length] });
}

// --- Sicherung ---

export async function exportBackup(): Promise<Backup> {
  return tx(STORES, "readonly", async (t) => {
    const meta: Record<string, unknown> = {};
    for (const [k, v] of await t.entries("meta")) meta[String(k)] = v;
    return {
      format: "budgetwerk-backup",
      version: 2,
      created_at: new Date().toISOString(),
      tasks: await t.all<Task>("tasks"),
      projects: await t.all<Project>("projects"),
      accounts: await t.all<Account>("accounts"),
      recurring: await t.all<Recurring>("recurring"),
      plan: await t.all<PlanItem>("plan"),
      bookings: await t.all<Booking>("bookings"),
      meta,
    };
  });
}

export async function importBackup(b: Backup) {
  if (b?.format !== "budgetwerk-backup" || !Array.isArray(b.accounts)) throw new Error("Das ist keine Budgetwerk-Sicherung.");
  await tx(STORES, "readwrite", async (t) => {
    for (const s of STORES) await t.clear(s);
    for (const a of b.accounts) await t.put("accounts", a);
    for (const r of b.recurring ?? []) await t.put("recurring", r);
    for (const p of b.plan ?? []) await t.put("plan", p);
    for (const x of b.bookings ?? []) await t.put("bookings", x);
    for (const x of b.tasks ?? []) await t.put("tasks", x);
    for (const x of b.projects ?? []) await t.put("projects", x);
    for (const [k, v] of Object.entries(b.meta ?? {})) await t.put("meta", v as string, k);
  });
}

export async function wipeAll() {
  await tx(STORES, "readwrite", async (t) => { for (const s of STORES) await t.clear(s); });
}

/** Beispieldaten, damit man die App sofort ausprobieren kann. */
export async function loadDemo(month: string) {
  const giro = await saveAccount({ name: "Girokonto", bank: "sparkasse", kind: "giro", balance_cents: 184250, goal_cents: null });
  const rev = await saveAccount({ name: "Revolut", bank: "revolut", kind: "giro", balance_cents: 32000, goal_cents: null });
  const spar = await saveAccount({ name: "Extra-Konto", bank: "ing", kind: "spar", balance_cents: 420000, goal_cents: 1000000 });
  await saveAccount({ name: "Visa", bank: "advanzia", kind: "kredit", balance_cents: -12990, goal_cents: null });
  await saveAccount({ name: "Geldbeutel", bank: "bargeld", kind: "bargeld", balance_cents: 8500, goal_cents: null });
  await saveRecurring({ type: "einnahme", name: "Gehalt", amount_cents: 285000, account_id: giro, day: 28, category: "Gehalt", active: true });
  for (const [name, amount, day, cat] of [
    ["Miete", 89000, 1, "Wohnen"], ["Strom", 6500, 5, "Wohnen"], ["Handy", 1999, 10, "Verträge"],
    ["Internet", 3499, 10, "Verträge"], ["Versicherungen", 7800, 1, "Versicherungen"], ["Streaming", 1799, 15, "Abos"],
  ] as const) await saveRecurring({ type: "fix", name, amount_cents: amount, account_id: giro, day, category: cat, active: true });
  for (const [name, emoji, amount, acc] of [
    ["Lebensmittel", "🛒", 40000, giro], ["Tanken", "⛽", 15000, giro], ["Freizeit", "🎉", 12000, rev], ["Kleidung", "👟", 8000, rev],
  ] as const) await savePlanItem({ month, type: "ausgabe", name, emoji, amount_cents: amount, account_id: acc, target_account_id: null, done: false });
  await savePlanItem({ month, type: "sparen", name: "Notgroschen", emoji: "🐷", amount_cents: 40000, account_id: giro, target_account_id: spar, done: false });
}
