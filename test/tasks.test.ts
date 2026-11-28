import { beforeEach, describe, expect, it } from "vitest";
import { resetForTests } from "../src/lib/db";
import { exportBackup, importBackup, loadTasks, saveTask, toggleTask } from "../src/lib/store";
import { groupOpen, layoutDay, nextDate, parseQuick, taskToIcs } from "../src/lib/tasks";
import type { Task } from "../src/lib/types";

const TODAY = "2026-11-28"; // Samstag

const task = (over: Partial<Task>): Task => ({
  id: 1, title: "x", notes: "", kind: "aufgabe", project_id: null, date: TODAY, time: null, duration_min: null,
  priority: 0, repeat: "nie", subtasks: [], done: false, completed_at: null, focus_min: 0, created_at: "", ...over,
});

describe("Schnelleingabe", () => {
  it("erkennt Datum, Uhrzeit, Dauer, Priorität und Projekt", () => {
    expect(parseQuick("Zahnarzt morgen 14:30 1h !! #privat", TODAY)).toEqual(
      { title: "Zahnarzt", date: "2026-11-29", time: "14:30", duration: 60, priority: 2, project: "privat" });
  });
  it("versteht Wochentage, Datumsangaben und 'um 9'", () => {
    expect(parseQuick("Sport montag um 9", TODAY)).toMatchObject({ title: "Sport", date: "2026-11-30", time: "09:00" });
    expect(parseQuick("Steuer 31.5.", TODAY).date).toBe("2027-05-31");
    expect(parseQuick("Party 24.12.", TODAY).date).toBe("2026-12-24");
    expect(parseQuick("Lesen 30 min", TODAY)).toMatchObject({ title: "Lesen", duration: 30, date: null });
    expect(parseQuick("Anruf 15 uhr", TODAY)).toMatchObject({ title: "Anruf", time: "15:00", date: TODAY });
    expect(parseQuick("Rechnung gestern", TODAY).date).toBe("2026-11-27");
  });
});

describe("Wiederholung", () => {
  it("rechnet das nächste Datum", () => {
    expect(nextDate("2026-11-27", "werktags")).toBe("2026-11-30");
    expect(nextDate("2026-01-31", "monatlich")).toBe("2026-02-28");
    expect(nextDate("2026-11-28", "woechentlich")).toBe("2026-12-05");
    expect(nextDate("2026-11-28", "nie")).toBeNull();
  });
});

describe("Tagesplan", () => {
  it("stellt Überschneidungen nebeneinander", () => {
    const b = layoutDay([
      task({ id: 1, time: "09:00", duration_min: 60 }),
      task({ id: 2, time: "09:30", duration_min: 30 }),
      task({ id: 3, time: "11:00", duration_min: 30 }),
    ]);
    const by = (id: number) => b.find((x) => x.task.id === id)!;
    expect([by(1).col, by(1).cols, by(2).col, by(2).cols]).toEqual([0, 2, 1, 2]);
    expect([by(3).col, by(3).cols]).toEqual([0, 1]);
  });
  it("gruppiert offene Aufgaben", () => {
    const s = groupOpen([task({ id: 1, date: "2026-11-20" }), task({ id: 2 }), task({ id: 3, date: null }), task({ id: 4, done: true })], TODAY);
    expect(s.map((x) => x.key)).toEqual(["ueber", "heute", "ohne"]);
  });
  it("baut eine Kalenderdatei mit Erinnerung", () => {
    const ics = taskToIcs(task({ title: "Zahnarzt, Kontrolle", time: "14:30", duration_min: 60, repeat: "woechentlich" }));
    expect(ics).toContain("DTSTART:20261128T143000");
    expect(ics).toContain("DTEND:20261128T153000");
    expect(ics).toContain("SUMMARY:Zahnarzt\\, Kontrolle");
    expect(ics).toContain("RRULE:FREQ=WEEKLY");
    expect(ics).toContain("TRIGGER:-PT15M");
  });
});

describe("Aufgaben speichern", () => {
  beforeEach(resetForTests);
  it("legt beim Abhaken einer Wiederholung die nächste an und sichert alles", async () => {
    const id = await saveTask({ title: "Müll", notes: "", kind: "aufgabe", project_id: null, date: "2026-11-27", time: null, duration_min: null,
      priority: 1, repeat: "woechentlich", subtasks: [{ id: "a", title: "Gelb", done: true }] });
    expect(await toggleTask(id)).toBe("2026-12-04");
    const { tasks } = await loadTasks();
    expect(tasks).toHaveLength(2);
    const next = tasks.find((t) => !t.done)!;
    expect(next.date).toBe("2026-12-04");
    expect(next.subtasks[0].done).toBe(false);
    const backup = await exportBackup();
    await resetForTests();
    await importBackup(backup);
    expect((await loadTasks()).tasks).toHaveLength(2);
  });
});
