import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Check, FocusTimer, longDate, PRIO, ProjectForm, TaskForm, TaskRow, useToggle } from "../components/TaskParts";
import { dateLabel, today } from "../lib/format";
import { clearDone, loadTasks, moveTasks, projectByName, saveTask, toggleTask, type NewTask } from "../lib/store";
import { addDays, durationLabel, groupOpen, layoutDay, minutesOf, parseQuick, plannedMinutes, sortTasks, timeOf, WD_SHORT, weekday, weekStart, WEEKDAYS } from "../lib/tasks";
import type { Project, Task } from "../lib/types";
import { Bar, Donut, Empty, Sheet, useAction, useData } from "../ui";

type View = "tag" | "liste" | "projekte";
type SheetState = { kind: "task"; task?: Task; preset?: Partial<NewTask> } | { kind: "project"; project?: Project } | null;

const PX = 1.1; // Pixel pro Minute im Tagesplan

export function TasksPage({ initialView }: { initialView?: View }) {
  const data = useData(loadTasks);
  const [view, setView] = useState<View>(initialView ?? "tag");
  const [day, setDay] = useState(today());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [focus, setFocus] = useState<Task | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const toggle = useToggle();
  if (!data) return null;
  const { tasks, projects } = data;
  const proj = (id: number | null) => projects.find((p) => p.id === id);
  const open = (task: Task) => setSheet({ kind: "task", task });
  const onToggle = (task: Task) => (el: HTMLElement) => { void toggle(task, el, toggleTask); };
  const row = (t: Task, showDate = false) => (
    <TaskRow key={t.id} task={t} project={proj(t.project_id)} onToggle={onToggle(t)} onOpen={() => open(t)} showDate={showDate} />
  );

  return (
    <div className="stagger">
      <h1>Aufgaben</h1>
      <div className="seg onbgseg">
        <button className={view === "tag" ? "on" : ""} onClick={() => setView("tag")}>Tagesplan</button>
        <button className={view === "liste" ? "on" : ""} onClick={() => setView("liste")}>Alle</button>
        <button className={view === "projekte" ? "on" : ""} onClick={() => setView("projekte")}>Projekte</button>
      </div>

      {view !== "projekte" && <QuickAdd defaultDate={view === "tag" ? day : null} projectId={view === "liste" ? projectFilter : null} />}

      {view === "tag" && <DayView tasks={tasks} day={day} setDay={setDay} row={row} onNew={(preset) => setSheet({ kind: "task", preset })} onOpen={open} proj={proj} onToggle={onToggle} />}

      {view === "liste" && (
        <ListView tasks={tasks} projects={projects} row={row} search={search} setSearch={setSearch} projectFilter={projectFilter} setProjectFilter={setProjectFilter} />
      )}

      {view === "projekte" && (
        <>
          <div className="actions"><button onClick={() => setSheet({ kind: "project" })}>＋ Projekt</button></div>
          {!projects.length && <Empty icon="📁" title="Noch keine Projekte">Projekte bündeln Aufgaben, z. B. „Haushalt“, „Arbeit“ oder „Roller“. Tipp: In der Schnelleingabe legt „#name“ ein Projekt an.</Empty>}
          <div className="projgrid">
            {projects.map((p, i) => {
              const list = tasks.filter((t) => t.project_id === p.id);
              const done = list.filter((t) => t.done).length;
              return (
                <div key={p.id} className="card projcard" style={{ animationDelay: `${i * 50}ms`, borderTop: `4px solid ${p.color}` }}
                  onClick={() => { setProjectFilter(p.id); setView("liste"); }} role="button" tabIndex={0}>
                  <div className="spread"><span className="pemoji">{p.emoji}</span>
                    <button type="button" className="ghost small" onClick={(e) => { e.stopPropagation(); setSheet({ kind: "project", project: p }); }} aria-label="Projekt bearbeiten">✎</button></div>
                  <strong>{p.name}</strong>
                  <div className="muted small">{list.length - done} offen · {done} erledigt</div>
                  <Bar value={done} max={list.length || 1} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {view !== "projekte" && createPortal(
        <button className="fab" onClick={() => setSheet({ kind: "task", preset: { date: view === "tag" ? day : null, project_id: view === "liste" ? projectFilter : null } })} aria-label="Neue Aufgabe">＋</button>,
        document.body,
      )}

      <Sheet open={sheet?.kind === "task"} onClose={() => setSheet(null)} title={sheet?.kind === "task" && sheet.task ? "Aufgabe" : "Neue Aufgabe"}>
        {sheet?.kind === "task" && <TaskForm key={sheet.task?.id ?? "neu"} task={sheet.task} preset={sheet.preset} projects={projects} onFocus={setFocus} />}
      </Sheet>
      <Sheet open={sheet?.kind === "project"} onClose={() => setSheet(null)} title={sheet?.kind === "project" && sheet.project ? "Projekt bearbeiten" : "Neues Projekt"}>
        {sheet?.kind === "project" && <ProjectForm project={sheet.project} />}
      </Sheet>
      {focus && <FocusTimer task={focus} onClose={() => setFocus(null)} />}
    </div>
  );
}

// --- Schnelleingabe ---

function QuickAdd({ defaultDate, projectId }: { defaultDate: string | null; projectId: number | null }) {
  const [text, setText] = useState("");
  const { busy, run } = useAction();
  const q = useMemo(() => (text.trim() ? parseQuick(text, today()) : null), [text]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q) return;
    void run(async () => {
      const pid = q.project ? await projectByName(q.project) : projectId;
      const date = q.date ?? defaultDate;
      await saveTask({ title: q.title, notes: "", kind: q.time ? "termin" : "aufgabe", project_id: pid, date, time: date ? q.time : null,
        duration_min: q.duration, priority: q.priority, repeat: "nie", subtasks: [] });
      setText("");
      return `„${q.title}“ ${date ? `für ${longDate(date).replace(/^(Heute|Morgen|Gestern)$/, (x) => x.toLowerCase())} ` : ""}angelegt.`;
    });
  };
  return (
    <form className="quick-add" onSubmit={submit}>
      <div className="qa-row">
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Neu: z. B. Zahnarzt morgen 14:30 1h !!" aria-label="Schnelleingabe" enterKeyHint="done" />
        <button disabled={busy || !q} aria-label="Hinzufügen">＋</button>
      </div>
      {q && (q.date || q.time || q.duration || q.priority || q.project) && (
        <div className="qa-preview">
          {q.date && <span>📅 {longDate(q.date)}</span>}
          {q.time && <span>🕒 {q.time}</span>}
          {q.duration && <span>⏱ {durationLabel(q.duration)}</span>}
          {q.priority > 0 && <span><i className="dot" style={{ background: PRIO[q.priority].color }} />{PRIO[q.priority].label}</span>}
          {q.project && <span>#{q.project}</span>}
        </div>
      )}
    </form>
  );
}

// --- Tagesplan ---

function DayView({ tasks, day, setDay, row, onNew, onOpen, proj, onToggle }: {
  tasks: Task[]; day: string; setDay: (d: string) => void; row: (t: Task, showDate?: boolean) => ReactElement;
  onNew: (preset: Partial<NewTask>) => void; onOpen: (t: Task) => void; proj: (id: number | null) => Project | undefined;
  onToggle: (t: Task) => (el: HTMLElement) => void;
}) {
  const { busy, run } = useAction();
  const t0 = today();
  const ws = weekStart(day);
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const ofDay = tasks.filter((t) => t.date === day).sort(sortTasks);
  const overdue = day === t0 ? tasks.filter((t) => !t.done && t.date && t.date < t0).sort(sortTasks) : [];
  const allDay = ofDay.filter((t) => !t.time);
  const blocks = layoutDay(ofDay);
  const doneCount = ofDay.filter((t) => t.done).length;
  const planned = plannedMinutes(ofDay);
  const [dir, setDir] = useState<"l" | "r">("r");
  const go = (d: string) => { setDir(d > day ? "r" : "l"); setDay(d); };

  return (
    <>
      <div className="weekstrip">
        <button className="ghost" onClick={() => go(addDays(day, -7))} aria-label="Vorige Woche">‹</button>
        <div className="days" key={ws}>
          {week.map((d) => {
            const n = tasks.filter((t) => t.date === d && !t.done).length;
            return (
              <button key={d} className={`wd${d === day ? " on" : ""}${d === t0 ? " today" : ""}`} onClick={() => go(d)}>
                <small>{WD_SHORT[weekday(d)]}</small><b>{Number(d.slice(8))}</b><i className={n ? "has" : ""}>{n > 0 ? n : ""}</i>
              </button>
            );
          })}
        </div>
        <button className="ghost" onClick={() => go(addDays(day, 7))} aria-label="Nächste Woche">›</button>
      </div>

      <div className={`card daycard slide-${dir}`} key={day}>
        <Donut size={74} stroke={9} parts={[{ value: doneCount, color: "#3EF0B1", label: "Erledigt" }, { value: ofDay.length - doneCount, color: "#E3E8F2", label: "Offen" }]}>
          <strong className="mini">{doneCount}/{ofDay.length}</strong>
        </Donut>
        <div className="grow">
          <strong className="dayname">{day === t0 ? "Heute" : WEEKDAYS[weekday(day)]}</strong>
          <div className="muted small">{WEEKDAYS[weekday(day)]}, {dateLabel(day)} {day.slice(0, 4)}</div>
          <div className="muted small">{ofDay.length ? `${ofDay.length - doneCount} offen${planned ? ` · ${durationLabel(planned)} geplant` : ""}` : "Nichts geplant"}</div>
        </div>
        {day !== t0 && <button className="small secondary" onClick={() => go(t0)}>Heute</button>}
      </div>

      {overdue.length > 0 && (
        <>
          <div className="spread"><h2>Überfällig</h2>
            <button className="small onbgbtn" disabled={busy} onClick={() => run(async () => { await moveTasks(overdue.map((t) => t.id), t0); return `${overdue.length} auf heute verschoben.`; })}>Alle auf heute</button>
          </div>
          <div className="card list tasklist">{overdue.map((t) => row(t, true))}</div>
        </>
      )}

      {allDay.length > 0 && (
        <>
          <h2>Ohne Uhrzeit</h2>
          <div className="card list tasklist">{allDay.map((t) => row(t))}</div>
        </>
      )}

      <h2>Zeitplan</h2>
      <Timeline day={day} blocks={blocks} onNew={(time) => onNew({ date: day, time, duration_min: 60, kind: "termin" })} onOpen={onOpen} proj={proj} onToggle={onToggle} />
      {!ofDay.length && !overdue.length && <p className="onbg small center">Tippe in den Zeitplan, um zu einer Uhrzeit etwas einzutragen.</p>}
    </>
  );
}

function Timeline({ day, blocks, onNew, onOpen, proj, onToggle }: {
  day: string; blocks: ReturnType<typeof layoutDay>; onNew: (time: string) => void; onOpen: (t: Task) => void;
  proj: (id: number | null) => Project | undefined; onToggle: (t: Task) => (el: HTMLElement) => void;
}) {
  const first = Math.min(7, ...blocks.map((b) => Math.floor(b.start / 60)));
  const last = Math.max(22, ...blocks.map((b) => Math.ceil(b.end / 60)));
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  const ref = useRef<HTMLDivElement>(null);
  const isToday = day === today();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  useEffect(() => {
    // Beim Öffnen zur aktuellen Uhrzeit bzw. zum ersten Termin scrollen ist auf dem Handy zu sprunghaft – nur innerhalb der Karte.
    const el = ref.current;
    if (!el) return;
    const target = isToday ? nowMin : blocks[0]?.start ?? 8 * 60;
    el.scrollTop = Math.max(0, (target - first * 60) * PX - 60);
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const click = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const min = first * 60 + Math.floor((e.clientY - r.top) / PX / 30) * 30;
    onNew(timeOf(Math.max(0, Math.min(23 * 60 + 30, min))));
  };
  return (
    <div className="card timeline" ref={ref}>
      <div className="tl-inner" style={{ height: (last - first) * 60 * PX + 10 }}>
        {hours.map((h) => (
          <div key={h} className="tl-hour" style={{ top: (h - first) * 60 * PX }}><span>{String(h).padStart(2, "0")}:00</span></div>
        ))}
        <div className="tl-grid" onClick={click} />
        {isToday && nowMin >= first * 60 && nowMin <= last * 60 && <div className="tl-now" style={{ top: (nowMin - first * 60) * PX }} />}
        {blocks.map((b, i) => {
          const p = proj(b.task.project_id);
          const color = p?.color ?? (b.task.kind === "termin" ? "#4AA8FF" : "#8C6CFF");
          const h = (b.end - b.start) * PX;
          return (
            <div key={b.task.id} className={`tl-block${b.task.done ? " done" : ""}`} onClick={() => onOpen(b.task)}
              style={{ top: (b.start - first * 60) * PX, height: h - 2, left: `calc(52px + (100% - 58px) * ${b.col / b.cols})`, width: `calc((100% - 58px) / ${b.cols} - 3px)`,
                background: color + "2E", borderLeftColor: color, animationDelay: `${i * 50}ms` }}>
              <div className="tl-head">
                {h >= 30 && <Check done={b.task.done} onToggle={onToggle(b.task)} color={color} />}
                <div className="grow">
                  <div className="tt">{b.task.title}</div>
                  {h >= 44 && <div className="meta">{b.task.time}–{timeOf(b.end)}{p ? ` · ${p.emoji} ${p.name}` : ""}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Alle Aufgaben ---

function ListView({ tasks, projects, row, search, setSearch, projectFilter, setProjectFilter }: {
  tasks: Task[]; projects: Project[]; row: (t: Task, showDate?: boolean) => ReactElement;
  search: string; setSearch: (s: string) => void; projectFilter: number | null; setProjectFilter: (id: number | null) => void;
}) {
  const { busy, run } = useAction();
  const q = search.trim().toLowerCase();
  const filtered = tasks.filter((t) => (projectFilter == null || t.project_id === projectFilter)
    && (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.subtasks.some((s) => s.title.toLowerCase().includes(q))));
  const sections = groupOpen(filtered, today());
  const done = filtered.filter((t) => t.done).sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return (
    <>
      <input type="search" className="searchbox" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Suchen" aria-label="Aufgaben durchsuchen" />
      {projects.length > 0 && (
        <div className="chips onbgchips">
          <button className={`chip${projectFilter == null ? " on" : ""}`} onClick={() => setProjectFilter(null)}>Alle</button>
          {projects.map((p) => <button key={p.id} className={`chip${projectFilter === p.id ? " on" : ""}`} onClick={() => setProjectFilter(projectFilter === p.id ? null : p.id)}>{p.emoji} {p.name}</button>)}
        </div>
      )}
      {!sections.length && <Empty icon={q ? "🔍" : "🎉"} title={q ? "Nichts gefunden" : "Alles erledigt!"}>{q ? "Versuch einen anderen Suchbegriff." : "Keine offenen Aufgaben."}</Empty>}
      {sections.map((s) => (
        <section key={s.key}>
          <h2 className={s.key === "ueber" ? "warn-h" : ""}>{s.label} <small className="count">{s.tasks.length}</small></h2>
          <div className="card list tasklist">{s.tasks.map((t) => row(t, s.key !== "heute" && s.key !== "morgen"))}</div>
        </section>
      ))}
      {done.length > 0 && (
        <details className="donebox">
          <summary>Erledigt ({done.length})</summary>
          <div className="card list tasklist">{done.slice(0, 100).map((t) => row(t, true))}</div>
          <button className="danger" disabled={busy} onClick={() => run(async () => {
            if (!window.confirm("Alle erledigten Aufgaben endgültig löschen?")) return;
            const n = await clearDone(); return `${n} erledigte Aufgaben gelöscht.`;
          })}>Erledigte löschen</button>
        </details>
      )}
    </>
  );
}

/** Karte für die Übersicht: was heute ansteht */
export function TodayCard() {
  const data = useData(loadTasks);
  const toggle = useToggle();
  if (!data) return null;
  const t0 = today();
  const todays = data.tasks.filter((t) => t.date === t0).sort(sortTasks);
  const overdue = data.tasks.filter((t) => !t.done && t.date && t.date < t0).length;
  const openT = todays.filter((t) => !t.done);
  if (!data.tasks.length) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = openT.find((t) => t.time && minutesOf(t.time) >= nowMin);
  return (
    <>
      <h2>Heute zu tun</h2>
      <div className="card todaycard">
        <a href="#/aufgaben" className="plain spread">
          <span><strong>{openT.length ? `${openT.length} offen` : "Alles erledigt 🎉"}</strong>{overdue > 0 && <span className="neg small"> · {overdue} überfällig</span>}</span>
          <span className="muted small">{next ? `Als Nächstes ${next.time}` : ""} ›</span>
        </a>
        {todays.length > 0 && <Bar value={todays.length - openT.length} max={todays.length} />}
        <div className="list tasklist flat">
          {openT.slice(0, 4).map((t) => (
            <div key={t.id} className="taskrow">
              <Check done={false} onToggle={(el) => { void toggle(t, el, toggleTask); }} />
              <a href="#/aufgaben" className="grow plain"><div className="tt">{t.title}</div>{t.time && <div className="meta"><span>🕒 {t.time}</span></div>}</a>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
