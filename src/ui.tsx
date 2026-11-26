import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { bank as bankOf } from "./lib/banks";
import { onChange } from "./lib/db";
import { euro, parseEuro, centsToInput } from "./lib/format";
import type { Account, BankId } from "./lib/types";

// --- Navigation über den Teil der Adresse hinter "#": funktioniert offline und in jedem Unterordner ---

export function useRoute() {
  const read = () => window.location.hash.slice(1) || "/";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path: string) => { window.location.hash = path; };

export function Link({ to, className, children, style }: { to: string; className?: string; children: ReactNode; style?: CSSProperties }) {
  return <a href={`#${to}`} className={className} style={style}>{children}</a>;
}

// --- Kurze Hinweise ("Toasts") ---

type Toast = { id: number; text: string; kind: "ok" | "err" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "err" ? "alert" : "status"}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// --- Daten laden: lädt neu, sobald irgendwo gespeichert wurde ---

export function useData<T>(load: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);
  const toast = useToast();
  useEffect(() => onChange(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    let alive = true;
    load().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) toast((e as Error).message, "err"); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return data;
}

/** Führt eine Aktion aus und zeigt Fehler als Hinweis an, statt sie zu verschlucken. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void | string>) => {
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) toast(msg);
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}

// --- Animationen ---

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Zählt weich vom alten zum neuen Betrag. */
export function Money({ cents, className, signed }: { cents: number; className?: string; signed?: boolean }) {
  const [shown, setShown] = useState(reduced() ? cents : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reduced()) { setShown(cents); return; }
    const start = performance.now();
    const a = from.current;
    const dur = 900;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(a + (cents - a) * e);
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents]);
  const text = euro(shown);
  return <span className={className}>{signed && shown > 0 ? "+" : ""}{text}</span>;
}

/** Ring-Diagramm, dessen Segmente sich beim Erscheinen aufbauen. */
export function Donut({ parts, size = 172, stroke = 20, children }: {
  parts: { value: number; color: string; label: string }[];
  size?: number; stroke?: number; children?: ReactNode;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t); }, []);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map((p) => `${p.label} ${euro(p.value)}`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={stroke} />
        {total > 0 && parts.map((p, i) => {
          const len = (Math.max(0, p.value) / total) * c;
          const seg = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={`${on ? Math.max(0, len - 2) : 0} ${c}`} strokeDashoffset={-offset}
              style={{ transition: `stroke-dasharray 1s cubic-bezier(.2,.8,.2,1) ${i * 0.12}s` }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}

/** Fortschrittsbalken, der beim Erscheinen von 0 auf den Wert wächst. */
export function Bar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className={`bar${over ? " over" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: on ? `${pct}%` : 0 }} />
    </div>
  );
}

/** Kleines Konfetti, z. B. wenn eine Sparrate umgebucht wurde. */
export function useConfetti() {
  return useCallback((x = window.innerWidth / 2, y = window.innerHeight / 2) => {
    if (reduced()) return;
    const colors = ["#3EF0B1", "#8C6CFF", "#FFC857", "#FF6B8B", "#FFFFFF"];
    const host = document.createElement("div");
    host.className = "confetti";
    for (let i = 0; i < 28; i++) {
      const s = document.createElement("i");
      const ang = Math.random() * Math.PI * 2;
      const dist = 70 + Math.random() * 120;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.background = colors[i % colors.length];
      s.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(ang) * dist - 60}px`);
      s.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
      s.style.animationDelay = `${Math.random() * 80}ms`;
      host.append(s);
    }
    document.body.append(host);
    setTimeout(() => host.remove(), 1400);
  }, []);
}

/** Schwebender Betrag, z. B. "+5 €" über dem Knopf. */
export function floatText(text: string, el: HTMLElement | null, color = "#3EF0B1") {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "floattext";
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top}px`;
  f.style.color = color;
  document.body.append(f);
  setTimeout(() => f.remove(), 1000);
}

// --- Bausteine ---

export function BankLogo({ id, size = 40 }: { id: BankId; size?: number }) {
  const b = bankOf(id);
  const [failed, setFailed] = useState(false);
  if (b.logo && !failed) {
    return <img className="banklogo img" src={b.logo} alt={b.name} width={size} height={size} onError={() => setFailed(true)} />;
  }
  return (
    <span className="banklogo" aria-label={b.name} title={b.name}
      style={{ width: size, height: size, background: b.color, color: b.ink, fontSize: b.mark.length > 1 ? size * 0.3 : size * 0.48 }}>
      {b.mark}
    </span>
  );
}

/** Unten hereingleitendes Blatt für Formulare. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!open) return;
    setClosing(false);
    document.body.classList.add("noscroll");
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.classList.remove("noscroll"); window.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const close = () => {
    if (reduced()) { onClose(); return; }
    setClosing(true);
    setTimeout(onClose, 220);
  };
  if (!open) return null;
  return (
    <div className={`sheet-wrap${closing ? " closing" : ""}`} onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grip" aria-hidden="true" />
        <div className="spread"><h3>{title}</h3><button type="button" className="ghost" onClick={close} aria-label="Schließen">✕</button></div>
        <SheetClose.Provider value={close}>{children}</SheetClose.Provider>
      </div>
    </div>
  );
}
const SheetClose = createContext<() => void>(() => undefined);
export const useSheetClose = () => useContext(SheetClose);

/** Betragsfeld mit Ziffernblock auf dem iPhone. */
export function MoneyInput({ value, onChange, label, autoFocus, allowNegative }: {
  value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean; allowNegative?: boolean;
}) {
  const id = useId();
  const bad = value.trim() !== "" && (parseEuro(value) === null || (!allowNegative && (parseEuro(value) ?? 0) < 0));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="moneyin">
        <input id={id} type="text" inputMode="decimal" value={value} autoFocus={autoFocus} placeholder="0,00"
          onChange={(e) => onChange(e.target.value)} aria-invalid={bad} />
        <span>€</span>
      </div>
      {bad && <p className="hint err">Bitte einen Betrag wie 12,50 eingeben.</p>}
    </div>
  );
}
export const toInput = (cents: number | null | undefined) => (cents ? centsToInput(cents) : "");

export function AccountSelect({ accounts, value, onChange, label, allowNone, filter }: {
  accounts: Account[]; value: number | null; onChange: (id: number | null) => void; label: string; allowNone?: string; filter?: (a: Account) => boolean;
}) {
  const list = filter ? accounts.filter(filter) : accounts;
  return (
    <div className="field">
      <label>{label}</label>
      <div className="accpick">
        {allowNone && (
          <button type="button" className={`accchip${value == null ? " on" : ""}`} onClick={() => onChange(null)}>
            <span className="banklogo none" style={{ width: 28, height: 28 }}>–</span>{allowNone}
          </button>
        )}
        {list.map((a) => (
          <button type="button" key={a.id} className={`accchip${value === a.id ? " on" : ""}`} onClick={() => onChange(a.id)}>
            <BankLogo id={a.bank} size={28} /> {a.name}
          </button>
        ))}
      </div>
      {!list.length && <p className="hint">Noch kein passendes Konto. Lege zuerst eins unter „Konten“ an.</p>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="empty-ico" aria-hidden="true">{icon}</div>
      <strong>{title}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
