// Reine Regeln für Aufgaben und Zeitplanung, ohne Speicherzugriff. Getestet in test/tasks.test.ts.
import type { Repeat, Task } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: string) => new Date(`${d}T12:00:00Z`);
const fromDate = (x: Date) => x.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const x = toDate(date);
  x.setUTCDate(x.getUTCDate() + n);
  return fromDate(x);
}

/** 0 = Montag … 6 = Sonntag */
export const weekday = (date: string) => (toDate(date).getUTCDay() + 6) % 7;
export const weekStart = (date: string) => addDays(date, -weekday(date));
export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function addMonthsClamped(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return fromDate(first);
}

export function nextDate(date: string, repeat: Repeat): string | null {
  switch (repeat) {
    case "taeglich": return addDays(date, 1);
    case "werktags": { let x = addDays(date, 1); while (weekday(x) > 4) x = addDays(x, 1); return x; }
    case "woechentlich": return addDays(date, 7);
    case "monatlich": return addMonthsClamped(date, 1);
    case "jaehrlich": return addMonthsClamped(date, 12);
    default: return null;
  }
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  nie: "Nie", taeglich: "Täglich", werktags: "Werktags", woechentlich: "Wöchentlich", monatlich: "Monatlich", jaehrlich: "Jährlich",
};

export const minutesOf = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
export const timeOf = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

export function durationLabel(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// --- Schnelleingabe ---

export interface Quick { title: string; date: string | null; time: string | null; duration: number | null; priority: 0 | 1 | 2 | 3; project: string | null }

/**
 * Liest z. B. "Zahnarzt morgen 14:30 1h !! #privat" →
 * Titel "Zahnarzt", morgen, 14:30, 60 min, Priorität mittel, Projekt "privat".
 */
export function parseQuick(input: string, today: string): Quick {
  let s = ` ${input.trim()} `;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = s.match(re);
    if (m) s = s.replace(re, " ");
    return m;
  };
  let priority: Quick["priority"] = 0;
  const pr = take(/\s(!{1,3})(?=\s)/);
  if (pr) priority = pr[1].length as 1 | 2 | 3;

  const pj = take(/\s#([\p{L}\d_-]+)(?=\s)/u);
  const project = pj ? pj[1] : null;

  let date: string | null = null;
  const dm = take(/\s(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?=\s)/);
  if (dm) {
    const y0 = Number(today.slice(0, 4));
    let y = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : y0;
    let d = `${y}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    if (!dm[3] && d < today) { y += 1; d = `${y}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`; }
    date = d;
  }
  if (!date && take(/\s(übermorgen|uebermorgen)(?=\s)/i)) date = addDays(today, 2);
  if (!date && take(/\s(morgen)(?=\s)/i)) date = addDays(today, 1);
  if (!date && take(/\s(heute)(?=\s)/i)) date = today;
  if (!date && take(/\s(gestern)(?=\s)/i)) date = addDays(today, -1);
  if (!date && take(/\s(nächste|naechste)\s+woche(?=\s)/i)) date = addDays(weekStart(today), 7);
  if (!date) {
    const wd = take(/\s(?:am\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?=\s)/i);
    if (wd) {
      const target = WEEKDAYS.findIndex((w) => w.toLowerCase() === wd[1].toLowerCase());
      date = addDays(today, (target - weekday(today) + 7) % 7);
    }
  }

  let time: string | null = null;
  const t1 = take(/\s(?:um\s+)?(\d{1,2})[:.](\d{2})(?:\s*uhr)?(?=\s)/i) ?? take(/\s(?:um\s+)?(\d{1,2})\s*uhr(?=\s)/i) ?? take(/\sum\s+(\d{1,2})(?=\s)/i);
  if (t1) {
    const h = Number(t1[1]), m = Number(t1[2] ?? 0);
    if (h < 24 && m < 60) time = `${pad(h)}:${pad(m)}`;
  }

  let duration: number | null = null;
  const dmin = take(/\s(\d{1,3})\s*(?:min|minuten)(?=\s)/i);
  if (dmin) duration = Number(dmin[1]);
  const dh = !dmin ? take(/\s(\d{1,2}(?:[.,]\d)?)\s*(?:h|std|stunden?)(?=\s)/i) : null;
  if (dh) duration = Math.round(parseFloat(dh[1].replace(",", ".")) * 60);

  const title = s.replace(/\s+/g, " ").trim() || input.trim();
  if (time && !date) date = today;
  return { title, date, time, duration, priority, project };
}

// --- Gruppierung ---

export type Section = { key: string; label: string; tasks: Task[] };

export function sortTasks(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const ad = a.date ?? "9999", bd = b.date ?? "9999";
  if (ad !== bd) return ad.localeCompare(bd);
  const at = a.time ?? "99", bt = b.time ?? "99";
  if (at !== bt) return at.localeCompare(bt);
  return b.priority - a.priority || a.id - b.id;
}

export function groupOpen(tasks: Task[], today: string): Section[] {
  const open = tasks.filter((t) => !t.done).sort(sortTasks);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(weekStart(today), 6);
  const sections: Section[] = [
    { key: "ueber", label: "Überfällig", tasks: open.filter((t) => t.date && t.date < today) },
    { key: "heute", label: "Heute", tasks: open.filter((t) => t.date === today) },
    { key: "morgen", label: "Morgen", tasks: open.filter((t) => t.date === tomorrow) },
    { key: "woche", label: "Diese Woche", tasks: open.filter((t) => t.date && t.date > tomorrow && t.date <= weekEnd) },
    { key: "spaeter", label: "Später", tasks: open.filter((t) => t.date && t.date > weekEnd && t.date > tomorrow) },
    { key: "ohne", label: "Ohne Datum", tasks: open.filter((t) => !t.date) },
  ];
  return sections.filter((x) => x.tasks.length);
}

// --- Tagesplan ---

export interface Block { task: Task; start: number; end: number; col: number; cols: number }

/** Verteilt Termine mit Uhrzeit auf Spalten, damit sich überschneidende nebeneinander stehen. */
export function layoutDay(tasks: Task[]): Block[] {
  const items = tasks
    .filter((t) => t.time)
    .map((t) => { const start = minutesOf(t.time!); return { task: t, start, end: start + Math.max(15, t.duration_min ?? 30), col: 0, cols: 1 }; })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Block[] = [];
  let cluster: Block[] = [];
  let colsEnd: number[] = [];
  let clusterEnd = -1;
  const flush = () => { cluster.forEach((b) => { b.cols = colsEnd.length; }); out.push(...cluster); cluster = []; colsEnd = []; };
  for (const it of items) {
    if (it.start >= clusterEnd && cluster.length) flush();
    let col = colsEnd.findIndex((e) => e <= it.start);
    if (col === -1) { col = colsEnd.length; colsEnd.push(it.end); } else colsEnd[col] = it.end;
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

/** Geplante Minuten eines Tages (offene Aufgaben mit Dauer) */
export const plannedMinutes = (tasks: Task[]) => tasks.filter((t) => !t.done).reduce((a, t) => a + (t.duration_min ?? 0), 0);

// --- Kalender-Export (.ics) ---

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const ymd = (d: string) => d.replace(/-/g, "");

export function taskToIcs(t: Task, now = new Date()): string {
  if (!t.date) throw new Error("Für den Kalender braucht die Aufgabe ein Datum.");
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Budgetwerk//Aufgaben//DE", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:budgetwerk-task-${t.id}-${ymd(t.date)}@budgetwerk`, `DTSTAMP:${stamp}`];
  if (t.time) {
    const start = minutesOf(t.time);
    const end = start + (t.duration_min ?? 60);
    const endDate = addDays(t.date, Math.floor(end / 1440));
    lines.push(`DTSTART:${ymd(t.date)}T${timeOf(start).replace(":", "")}00`, `DTEND:${ymd(endDate)}T${timeOf(end % 1440).replace(":", "")}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(t.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(t.date, 1))}`);
  }
  lines.push(`SUMMARY:${esc(t.title)}`);
  const desc = [t.notes, ...t.subtasks.map((s) => `${s.done ? "☑" : "☐"} ${s.title}`)].filter(Boolean).join("\n");
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  const rrule: Partial<Record<Repeat, string>> = {
    taeglich: "FREQ=DAILY", werktags: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", woechentlich: "FREQ=WEEKLY", monatlich: "FREQ=MONTHLY", jaehrlich: "FREQ=YEARLY",
  };
  if (rrule[t.repeat]) lines.push(`RRULE:${rrule[t.repeat]}`);
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(t.title)}`, `TRIGGER:${t.time ? "-PT15M" : "PT9H"}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
