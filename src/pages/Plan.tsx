import { useState } from "react";
import { PlanForm, SpendForm, useSaveNow } from "../components/Forms";
import { monthSummary } from "../lib/budget";
import { addMonths, currentMonth, euro, monthLabel } from "../lib/format";
import { loadAll } from "../lib/load";
import { copyPlan, deletePlanItem } from "../lib/store";
import type { PlanItem } from "../lib/types";
import { Bar, BankLogo, Empty, Link, Money, Sheet, useAction, useData } from "../ui";
import { COLORS } from "./Home";

type SheetState = { kind: "form"; type: PlanItem["type"]; item?: PlanItem } | { kind: "spend"; item: PlanItem } | null;

export function PlanPage() {
  const data = useData(loadAll);
  const [month, setMonth] = useState(currentMonth());
  const [dir, setDir] = useState<"l" | "r">("r");
  const [sheet, setSheet] = useState<SheetState>(null);
  const { busy, run } = useAction();
  const saveNow = useSaveNow();
  if (!data) return null;
  const { accounts, recurring, plan, bookings } = data;
  const s = monthSummary(recurring, plan, bookings, month);
  const items = plan.filter((p) => p.month === month);
  const saves = items.filter((p) => p.type === "sparen");
  const spends = items.filter((p) => p.type === "ausgabe");
  const acc = (id: number | null) => accounts.find((a) => a.id === id);
  const shift = (n: number) => { setDir(n > 0 ? "r" : "l"); setMonth((m) => addMonths(m, n)); };

  if (!accounts.length) {
    return <div className="stagger"><h1>Planen</h1><Empty icon="🏦" title="Zuerst ein Konto anlegen"><Link to="/konten">Zu den Konten</Link></Empty></div>;
  }

  return (
    <div className="stagger">
      <h1>Planen</h1>
      <div className="monthnav">
        <button className="ghost" onClick={() => shift(-1)} aria-label="Vormonat">‹</button>
        <strong key={month} className={`slide-${dir}`}>{monthLabel(month)}</strong>
        <button className="ghost" onClick={() => shift(1)} aria-label="Nächster Monat">›</button>
      </div>

      <div className="card planhero" key={`hero-${month}`}>
        <div className="spread">
          <div><div className="muted small">Frei verfügbar</div><div className="stat"><Money cents={s.free} /></div></div>
          <div className="right"><div className="muted small">Noch unverplant</div><div className={`stat ${s.rest < 0 ? "neg" : "pos"}`}><Money cents={s.rest} /></div></div>
        </div>
        <div className="stack" aria-hidden="true">
          <span style={{ flex: Math.max(0, s.plannedSpend), background: COLORS.spend }} />
          <span style={{ flex: Math.max(0, s.plannedSave), background: COLORS.save }} />
          <span style={{ flex: Math.max(0, s.rest), background: "rgba(6,20,50,.12)" }} />
        </div>
        <div className="row legend-inline small">
          <span><i style={{ background: COLORS.spend }} />Ausgaben {euro(s.plannedSpend)}</span>
          <span><i style={{ background: COLORS.save }} />Sparen {euro(s.plannedSave)}</span>
        </div>
        {s.free <= 0 && <p className="hint">Trag unter <Link to="/fix">Fix</Link> dein Gehalt und deine Fixkosten ein, dann siehst du hier, wie viel frei ist.</p>}
        {s.rest < 0 && <p className="hint err">Überplant um {euro(-s.rest)}.</p>}
      </div>

      {!items.length && (
        <div className="card empty">
          <div className="empty-ico" aria-hidden="true">🗓️</div>
          <strong>Noch nichts geplant für {monthLabel(month)}</strong>
          <div className="actions" style={{ width: "100%", marginTop: 10 }}>
            <button onClick={() => setSheet({ kind: "form", type: "ausgabe" })}>＋ Ausgabe planen</button>
            <button className="secondary" disabled={busy} onClick={() => run(async () => { const n = await copyPlan(addMonths(month, -1), month); return `${n} Posten aus dem Vormonat übernommen.`; })}>Vormonat übernehmen</button>
          </div>
        </div>
      )}

      <div className="spread"><h2>Sparen</h2><button className="small onbgbtn" onClick={() => setSheet({ kind: "form", type: "sparen" })}>＋ Sparrate</button></div>
      {!saves.length && <Empty icon="🐷" title="Noch keine Sparrate">Lege fest, wie viel diesen Monat aufs Sparkonto geht.</Empty>}
      {saves.map((p, i) => {
        const to = acc(p.target_account_id);
        const from = acc(p.account_id);
        return (
          <div key={p.id} className={`card planitem save${p.done ? " done" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
            <button type="button" className="rowbtn" onClick={() => setSheet({ kind: "form", type: "sparen", item: p })}>
              <span className="emoji">{p.emoji}</span>
              <span className="grow"><strong>{p.name}</strong><br /><span className="muted small">{from ? `${from.name} → ` : ""}{to?.name ?? "Sparkonto fehlt"}</span></span>
              <b>{euro(p.amount_cents)}</b>
            </button>
            <div className="spread">
              {to && <span className="row nowrap small muted"><BankLogo id={to.bank} size={22} /> {euro(to.balance_cents)}{to.goal_cents ? ` von ${euro(to.goal_cents)}` : ""}</span>}
              {p.done
                ? <span className="badge ok">✓ umgebucht</span>
                : <button className="small" disabled={busy || !to} onClick={(e) => { void saveNow(p, e.currentTarget); }}>Jetzt umbuchen</button>}
            </div>
          </div>
        );
      })}

      <div className="spread"><h2>Ausgaben</h2><button className="small onbgbtn" onClick={() => setSheet({ kind: "form", type: "ausgabe" })}>＋ Posten</button></div>
      {!spends.length && items.length > 0 && <Empty icon="🛒" title="Keine Ausgaben geplant">Lebensmittel, Tanken, Freizeit …</Empty>}
      {spends.map((p, i) => {
        const spent = s.spentByPlan[p.id] ?? 0;
        const left = p.amount_cents - spent;
        return (
          <div key={p.id} className="card planitem" style={{ animationDelay: `${i * 60}ms` }}>
            <button type="button" className="rowbtn" onClick={() => setSheet({ kind: "form", type: "ausgabe", item: p })}>
              <span className="emoji">{p.emoji}</span>
              <span className="grow"><strong>{p.name}</strong><br /><span className={`small ${left < 0 ? "neg" : "muted"}`}>{left >= 0 ? `noch ${euro(left)}` : `${euro(-left)} drüber`}</span></span>
              <b>{euro(spent)} <span className="muted small">/ {euro(p.amount_cents)}</span></b>
            </button>
            <Bar value={spent} max={p.amount_cents} over={left < 0} />
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button className="small secondary" onClick={() => setSheet({ kind: "spend", item: p })}>− Ausgabe erfassen</button>
            </div>
          </div>
        );
      })}

      <Sheet open={sheet?.kind === "form"} onClose={() => setSheet(null)}
        title={sheet?.kind === "form" ? (sheet.item ? "Posten bearbeiten" : sheet.type === "sparen" ? "Neue Sparrate" : "Neue Ausgabe planen") : ""}>
        {sheet?.kind === "form" && (
          <>
            <PlanForm accounts={accounts} month={month} type={sheet.type} item={sheet.item} free={Math.max(0, sheet.item ? s.rest + sheet.item.amount_cents : s.rest)} />
            {sheet.item && (
              <button className="danger wide" style={{ marginTop: 8 }} disabled={busy}
                onClick={() => run(async () => { await deletePlanItem(sheet.item!.id); setSheet(null); return "Posten gelöscht."; })}>Posten löschen</button>
            )}
          </>
        )}
      </Sheet>
      <Sheet open={sheet?.kind === "spend"} onClose={() => setSheet(null)} title={sheet?.kind === "spend" ? `${sheet.item.emoji} ${sheet.item.name}` : ""}>
        {sheet?.kind === "spend" && <SpendForm accounts={accounts} item={sheet.item} left={sheet.item.amount_cents - (s.spentByPlan[sheet.item.id] ?? 0)} />}
      </Sheet>
    </div>
  );
}
