import { useState } from "react";
import { RecurringForm } from "../components/Forms";
import { monthSummary } from "../lib/budget";
import { currentMonth, euro, monthLabel } from "../lib/format";
import { loadAll } from "../lib/load";
import { bookMonth, deleteRecurring, saveRecurring } from "../lib/store";
import type { Recurring } from "../lib/types";
import { BankLogo, Empty, Link, Money, Sheet, useAction, useConfetti, useData } from "../ui";
import { COLORS } from "./Home";

export function FixedPage() {
  const data = useData(loadAll);
  const [sheet, setSheet] = useState<{ type: Recurring["type"]; item?: Recurring } | null>(null);
  const { busy, run } = useAction();
  const confetti = useConfetti();
  if (!data) return null;
  const { accounts, recurring, plan, bookings, booked } = data;
  const month = currentMonth();
  const s = monthSummary(recurring, plan, bookings, month);
  const income = recurring.filter((r) => r.type === "einnahme");
  const fixed = recurring.filter((r) => r.type === "fix");
  const cats = [...new Set(fixed.map((f) => f.category))];

  if (!accounts.length) {
    return <div className="stagger"><h1>Fix</h1><Empty icon="🏦" title="Zuerst ein Konto anlegen">Gehalt und Fixkosten brauchen ein Konto. <Link to="/konten">Zu den Konten</Link></Empty></div>;
  }

  const row = (r: Recurring) => {
    const a = accounts.find((x) => x.id === r.account_id);
    return (
      <div key={r.id} className={`listrow${r.active ? "" : " inactive"}`}>
        <button type="button" className="rowbtn" onClick={() => setSheet({ type: r.type, item: r })}>
          {a && <BankLogo id={a.bank} size={32} />}
          <span><strong>{r.name}</strong><br /><span className="muted small">am {r.day}. · {a?.name ?? "Konto fehlt"}</span></span>
        </button>
        <span className="row nowrap">
          <b className={r.type === "einnahme" ? "pos" : ""}>{r.type === "einnahme" ? "+" : "−"}{euro(r.amount_cents)}</b>
          <label className="switch" title={r.active ? "Aktiv" : "Pausiert"}>
            <input type="checkbox" checked={r.active} onChange={() => run(() => saveRecurring({ ...r, active: !r.active }))} />
            <span />
          </label>
        </span>
      </div>
    );
  };

  return (
    <div className="stagger">
      <h1>Fix</h1>
      <div className="card flow">
        <div className="flowrow"><span>Einnahmen</span><b className="pos"><Money cents={s.income} /></b></div>
        <div className="flowrow"><span>− Fixkosten</span><b style={{ color: COLORS.fix }}><Money cents={s.fixed} /></b></div>
        <div className="flowbar" aria-hidden="true">
          <span style={{ flex: Math.max(0, s.fixed), background: COLORS.fix }} />
          <span style={{ flex: Math.max(0, s.free), background: COLORS.save }} />
        </div>
        <div className="flowrow total"><span>Frei verfügbar</span><b className={s.free < 0 ? "neg" : ""}><Money cents={s.free} /></b></div>
        <Link to="/planen" className="btn wide" style={{ marginTop: 10 }}>Freies Geld verplanen →</Link>
      </div>

      {recurring.some((r) => r.active) && (
        booked.has(month)
          ? <div className="notice ok">✓ {monthLabel(month)} ist auf die Konten gebucht.</div>
          : <div className="notice glow">
              Gehalt und Fixkosten für {monthLabel(month)} auf die Kontostände buchen?
              <button className="small" disabled={busy} onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                void run(async () => { const n = await bookMonth(month); confetti(r.left + r.width / 2, r.top); return `${n} Buchungen erstellt.`; });
              }}>Monat buchen</button>
            </div>
      )}

      <div className="spread"><h2>Einnahmen</h2><button className="small onbgbtn" onClick={() => setSheet({ type: "einnahme" })}>＋ Gehalt</button></div>
      {income.length ? <div className="card list">{income.map(row)}</div> : <Empty icon="💼" title="Noch kein Gehalt">Trag dein Netto-Gehalt und das Konto ein, auf dem es eingeht.</Empty>}

      <div className="spread"><h2>Fixkosten</h2><button className="small onbgbtn" onClick={() => setSheet({ type: "fix" })}>＋ Fixkosten</button></div>
      {!fixed.length && <Empty icon="🏠" title="Noch keine Fixkosten">Miete, Strom, Handy, Versicherungen, Abos …</Empty>}
      {cats.map((c) => {
        const list = fixed.filter((f) => f.category === c).sort((a, b) => a.day - b.day);
        return (
          <div key={c} className="card list">
            <div className="listhead spread"><span>{c}</span><span>{euro(list.filter((x) => x.active).reduce((a, x) => a + x.amount_cents, 0))}</span></div>
            {list.map(row)}
          </div>
        );
      })}

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet?.item ? "Bearbeiten" : sheet?.type === "einnahme" ? "Neue Einnahme" : "Neue Fixkosten"}>
        {sheet && (
          <>
            <RecurringForm accounts={accounts} type={sheet.type} item={sheet.item} />
            {sheet.item && (
              <button className="danger wide" style={{ marginTop: 8 }} disabled={busy}
                onClick={() => run(async () => { await deleteRecurring(sheet.item!.id); setSheet(null); return "Gelöscht."; })}>Löschen</button>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
