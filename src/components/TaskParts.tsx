import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { dateLabel, today } from "../lib/format";
import { saveFile, vibrate } from "../lib/device";
import { deleteTask, patchTask, saveProject, saveTask, deleteProject, toggleTask, type NewTask } from "../lib/store";
import { addDays, durationLabel, REPEAT_LABEL, taskToIcs, weekday, WD_SHORT } from "../lib/tasks";
import type { Project, Repeat, Subtask, Task } from "../lib/types";
import { useAction, useConfetti, useSheetClose } from "../ui";

export const PRIO = [
  { v: 0, label: "Keine", color: "transparent" },
  { v: 1, label: "Niedrig", color: "#8C6CFF" },
  { v: 2, label: "Mittel", color: "#FFC857" },
  { v: 3, label: "Hoch", color: "#FF6B8B" },
] as const;

export function longDate(d: string): string {
  const t = today();
  if (d === t) return "Heute";
  if (d === addDays(t, 1)) return "Morgen";
  if (d === addDays(t, -1)) return "Gestern";
  return `${WD_SHORT[weekday(d)]}, ${dateLabel(d)}`;
}

/** Runder Haken, der sich beim Abhaken zeichnet */
export function Check({ done, onToggle, color }: { done: boolean; onToggle: (el: HTMLElement) => void; color?: string }) {
  return (
    <button type="button" className={`check${done ? " on" : ""}`} aria-pressed={done} aria-label={done ? "Als offen markieren" : "Erledigt"}
      style={color && !done ? { borderColor: color } : undefined}
      onClick={(e) => { e.stopPropagation(); onToggle(e.currentTarget); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" /></svg>
    </button>
  );
}

export function TaskRow({ task, project, onToggle, onOpen, showDate }: {
  task: Task; project?: Project; onToggle: (el: HTMLElement) => void; onOpen: () => void; showDate?: boolean;
}) {
  const subDone = task.subtasks.filter((s) => s.done).length;
  const overdue = !task.done && task.date && task.date < today();
  return (
    <div className={`taskrow${task.done ? " done" : ""}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <Check done={task.done} onToggle={onToggle} color={PRIO[task.priority].color !== "transparent" ? PRIO[task.priority].color : undefined} />
      <div className="grow">
        <div className="tt">{task.kind === "termin" && "📅 "}{task.title}</div>
        <div className="meta">
          {showDate && task.date && <span className={overdue ? "neg" : ""}>{longDate(task.date)}</span>}
          {task.time && <span>🕒 {task.time}</span>}
          {task.duration_min ? <span>⏱ {durationLabel(task.duration_min)}</span> : null}
          {task.repeat !== "nie" && <span>↻ {REPEAT_LABEL[task.repeat]}</span>}
          {task.subtasks.length > 0 && <span>☑ {subDone}/{task.subtasks.length}</span>}
          {task.notes && <span>📝</span>}
          {project && <span className="pchip" style={{ background: project.color + "26", color: "inherit" }}>{project.emoji} {project.name}</span>}
        </div>
      </div>
      {task.priority > 0 && <span className="prio" style={{ background: PRIO[task.priority].color }} title={`Priorität ${PRIO[task.priority].label}`} />}
    </div>
  );
}

/** Abhaken mit Konfetti und Hinweis auf die nächste Wiederholung */
export function useToggle() {
  const { run } = useAction();
  const confetti = useConfetti();
  return (task: Task, el: HTMLElement, toggle: (id: number) => Promise<string | null>) => run(async () => {
    const next = await toggle(task.id);
    if (!task.done) {
      vibrate(20);
      const r = el.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 2);
      if (next) return `Erledigt. Nächstes Mal: ${longDate(next)}`;
    }
  });
}

// --- Formular ---

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const sid = () => Math.random().toString(36).slice(2, 9);

export function TaskForm({ task, projects, preset, onFocus }: {
  task?: Task; projects: Project[]; preset?: Partial<NewTask>; onFocus?: (t: Task) => void;
}) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const base: Partial<NewTask> = task ?? preset ?? {};
  const [title, setTitle] = useState(base.title ?? "");
  const [kind, setKind] = useState<Task["kind"]>(base.kind ?? "aufgabe");
  const [date, setDate] = useState(base.date ?? "");
  const [time, setTime] = useState(base.time ?? "");
  const [duration, setDuration] = useState<number | null>(base.duration_min ?? null);
  const [priority, setPriority] = useState<Task["priority"]>(base.priority ?? 0);
  const [projectId, setProjectId] = useState<number | null>(base.project_id ?? null);
  const [repeat, setRepeat] = useState<Repeat>(base.repeat ?? "nie");
  const [notes, setNotes] = useState(base.notes ?? "");
  const [subtasks, setSubtasks] = useState<Subtask[]>(base.subtasks ?? []);
  const [newSub, setNewSub] = useState("");

  const data = (): NewTask => ({
    ...(task ?? {}), title, kind, date: date || null, time: date && time ? time : null, duration_min: duration,
    priority, project_id: projectId, repeat: date ? repeat : "nie", notes: notes.trim(), subtasks,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { await saveTask(data()); close(); return task ? "Gespeichert." : "Aufgabe angelegt."; });
  };
  const addSub = () => {
    if (!newSub.trim()) return;
    setSubtasks([...subtasks, { id: sid(), title: newSub.trim(), done: false }]);
    setNewSub("");
  };
  const t = today();

  return (
    <form onSubmit={submit} className="taskform">
      <input type="text" className="bigtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was ist zu tun?" autoFocus={!task} aria-label="Titel" />
      <div className="seg">
        <button type="button" className={kind === "aufgabe" ? "on" : ""} onClick={() => setKind("aufgabe")}>✓ Aufgabe</button>
        <button type="button" className={kind === "termin" ? "on" : ""} onClick={() => setKind("termin")}>📅 Termin</button>
      </div>

      <div className="field">
        <label>Wann?</label>
        <div className="chips tight">
          {[["Heute", t], ["Morgen", addDays(t, 1)], ["Übermorgen", addDays(t, 2)], ["Nächste Woche", addDays(t, 7 - weekday(t))], ["Ohne Datum", ""]].map(([l, d]) => (
            <button key={l} type="button" className={`chip${date === d ? " on" : ""}`} onClick={() => setDate(d)}>{l}</button>
          ))}
        </div>
        <div className="grid2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} aria-label="Uhrzeit" />
        </div>
        {time && <button type="button" className="linkbtn" onClick={() => setTime("")}>Uhrzeit entfernen</button>}
      </div>

      <div className="field">
        <label>Dauer</label>
        <div className="chips tight">
          {DURATIONS.map((d) => <button key={d} type="button" className={`chip${duration === d ? " on" : ""}`} onClick={() => setDuration(duration === d ? null : d)}>{durationLabel(d)}</button>)}
        </div>
      </div>

      <div className="field">
        <label>Priorität</label>
        <div className="seg">
          {PRIO.map((p) => (
            <button key={p.v} type="button" className={priority === p.v ? "on" : ""} onClick={() => setPriority(p.v)}>
              {p.v > 0 && <i className="dot" style={{ background: p.color }} />}{p.label}
            </button>
          ))}
        </div>
      </div>

      {projects.length > 0 && (
        <div className="field">
          <label>Projekt</label>
          <div className="chips tight">
            <button type="button" className={`chip${projectId == null ? " on" : ""}`} onClick={() => setProjectId(null)}>Keins</button>
            {projects.map((p) => <button key={p.id} type="button" className={`chip${projectId === p.id ? " on" : ""}`} onClick={() => setProjectId(p.id)}>{p.emoji} {p.name}</button>)}
          </div>
        </div>
      )}

      {date && (
        <div className="field">
          <label htmlFor="tf-rep">Wiederholen</label>
          <select id="tf-rep" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
          </select>
        </div>
      )}

      <div className="field">
        <label>Unteraufgaben</label>
        {subtasks.map((s) => (
          <div key={s.id} className="subrow">
            <Check done={s.done} onToggle={() => setSubtasks(subtasks.map((x) => x.id === s.id ? { ...x, done: !x.done } : x))} />
            <input type="text" value={s.title} onChange={(e) => setSubtasks(subtasks.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))} aria-label="Unteraufgabe" />
            <button type="button" className="ghost" onClick={() => setSubtasks(subtasks.filter((x) => x.id !== s.id))} aria-label="Entfernen">✕</button>
          </div>
        ))}
        <div className="subrow">
          <span className="check placeholder" aria-hidden="true">＋</span>
          <input type="text" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Unteraufgabe hinzufügen"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} onBlur={addSub} aria-label="Neue Unteraufgabe" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="tf-notes">Notizen</label>
        <textarea id="tf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details, Links, Adresse …" />
      </div>

      <button className="wide" disabled={busy}>{task ? "Speichern" : "Anlegen"}</button>

      {task && (
        <div className="taskactions">
          {onFocus && !task.done && <button type="button" className="secondary small" onClick={() => { close(); onFocus(task); }}>🎯 Fokus starten</button>}
          {task.date && <button type="button" className="secondary small" disabled={busy} onClick={() => run(async () => {
            const r = await saveFile(new File([taskToIcs(task)], `${task.title.replace(/[^\p{L}\d -]/gu, "").slice(0, 40) || "Termin"}.ics`, { type: "text/calendar" }));
            return r === "cancelled" ? undefined : "Kalenderdatei erstellt.";
          })}>📆 In Kalender</button>}
          {!task.done && <button type="button" className="secondary small" disabled={busy} onClick={() => run(async () => {
            await patchTask(task.id, { date: addDays(task.date && task.date > t ? task.date : t, 1) }); close(); return "Verschoben.";
          })}>→ Einen Tag später</button>}
          <button type="button" className="secondary small" disabled={busy} onClick={() => run(async () => {
            const { id: _i, ...rest } = task; await saveTask({ ...rest, title: `${task.title} (Kopie)`, done: false, completed_at: null, focus_min: 0 }); close(); return "Kopie angelegt.";
          })}>⧉ Duplizieren</button>
          <button type="button" className="danger small" disabled={busy} onClick={() => run(async () => {
            if (!window.confirm(`„${task.title}“ löschen?`)) return; await deleteTask(task.id); close(); return "Gelöscht.";
          })}>Löschen</button>
          {task.focus_min > 0 && <p className="hint" style={{ width: "100%" }}>Bisher {durationLabel(task.focus_min)} im Fokus gearbeitet.</p>}
        </div>
      )}
    </form>
  );
}

// --- Projekte ---

const P_COLORS = ["#8C6CFF", "#3EF0B1", "#FF6B8B", "#FFC857", "#4AA8FF", "#FF8A3D", "#A0E426", "#5B6B84"];
const P_EMOJIS = ["📁", "🏠", "💼", "🛵", "🏋️", "🎓", "🛒", "❤️", "✈️", "💡", "🧾", "🎮"];

export function ProjectForm({ project }: { project?: Project }) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const [name, setName] = useState(project?.name ?? "");
  const [emoji, setEmoji] = useState(project?.emoji ?? "📁");
  const [color, setColor] = useState(project?.color ?? P_COLORS[0]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await saveProject({ ...project, name: name.trim(), emoji, color }); close(); return "Projekt gespeichert."; }); }}>
      <div className="field"><label htmlFor="pf-name">Name</label><input id="pf-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Haushalt" autoFocus={!project} /></div>
      <div className="field"><label>Symbol</label><div className="emojis">{P_EMOJIS.map((em) => <button type="button" key={em} className={emoji === em ? "on" : ""} onClick={() => setEmoji(em)}>{em}</button>)}</div></div>
      <div className="field"><label>Farbe</label><div className="colors">{P_COLORS.map((c) => <button type="button" key={c} className={color === c ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div></div>
      <button className="wide" disabled={busy}>Speichern</button>
      {project && <button type="button" className="danger wide" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(async () => {
        if (!window.confirm(`Projekt „${project.name}“ löschen? Die Aufgaben bleiben erhalten.`)) return; await deleteProject(project.id); close(); return "Projekt gelöscht.";
      })}>Projekt löschen</button>}
    </form>
  );
}

// --- Fokus-Timer ---

export function FocusTimer({ task, onClose }: { task: Task; onClose: () => void }) {
  const { run } = useAction();
  const confetti = useConfetti();
  const total = (task.duration_min && task.duration_min <= 180 ? task.duration_min : 25) * 60_000;
  const [length, setLength] = useState(total);
  const [endAt, setEndAt] = useState<number | null>(Date.now() + total);
  const [left, setLeft] = useState(total);
  const startedAt = useRef(Date.now());
  const worked = useRef(0);
  const finished = useRef(false);

  useEffect(() => {
    if (endAt == null) return;
    const id = setInterval(() => {
      const l = Math.max(0, endAt - Date.now());
      setLeft(l);
      if (l === 0 && !finished.current) {
        finished.current = true;
        vibrate(400);
        confetti();
        setEndAt(null);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt, confetti]);

  const pause = () => { worked.current += Date.now() - startedAt.current; setEndAt(null); };
  const resume = () => { startedAt.current = Date.now(); finished.current = false; setEndAt(Date.now() + left); };
  const stop = (markDone: boolean) => run(async () => {
    const ms = worked.current + (endAt != null ? Date.now() - startedAt.current : 0);
    const min = Math.round(ms / 60_000);
    await patchTask(task.id, { focus_min: task.focus_min + min });
    if (markDone) await toggleTask(task.id);
    onClose();
    return min > 0 ? `${durationLabel(min)} Fokus gespeichert.` : undefined;
  });

  const r = 110, c = 2 * Math.PI * r;
  const p = length ? left / length : 0;
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  return createPortal(
    <div className="focus" role="dialog" aria-modal="true" aria-label="Fokus-Timer">
      <div className="focus-title">🎯 {task.title}</div>
      <div className="focus-ring">
        <svg viewBox="0 0 260 260">
          <circle cx="130" cy="130" r={r} className="track" />
          <circle cx="130" cy="130" r={r} className="prog" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 130 130)" />
        </svg>
        <div className="focus-time">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>
        {endAt == null && left > 0 && <div className="focus-state">Pausiert</div>}
        {left === 0 && <div className="focus-state">Geschafft! 🎉</div>}
      </div>
      <div className="row center-row">
        {left > 0 && (endAt != null
          ? <button className="secondary" onClick={pause}>⏸ Pause</button>
          : <button onClick={resume}>▶ Weiter</button>)}
        <button className="secondary" onClick={() => { setLength(length + 300_000); if (endAt != null) setEndAt(endAt + 300_000); else setLeft(left + 300_000); }}>+5 min</button>
      </div>
      <div className="row center-row">
        <button className="secondary" onClick={() => void stop(false)}>Beenden</button>
        <button onClick={() => void stop(true)}>✓ Beenden & erledigt</button>
      </div>
    </div>,
    document.body,
  );
}
