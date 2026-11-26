import { useState } from "react";
import { MONTHS, RecurringForm } from "../components/Forms";
import { isYearly, monthSummary, periodOf, recurringStatus, yearlyFixed } from "../lib/budget";
import { dateLabel, euro, monthLabel, today } from "../lib/format";
import { loadAll } from "../lib/load";
import { deleteRecurring, saveRecurring, saveSettings } from "../lib/store";
import type { Recurring } from "../lib/types";
import { BankLogo, Empty, Link, Money, Sheet, useAction, useData } from "../ui";
import { COLORS } from "./Home";

export function FixedPage() {
  const data = useData(loadAll);
  const [sheet, setSheet] = useState<{ type: Recurring["type"]; item?: Recurring } | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  const { busy, run } = useAction();
  if (!data) return null;
  const { accounts, recurring, plan, bookings, month, payday, settings, done } = data;
  const s = monthSummary(recurring, plan, bookings, month);
  const year = yearlyFixed(recurring);
  const period = periodOf(month, payday);
  const income = recurring.filter((r) => r.type === "einnahme");
  const fixed = recurring.filter((r) => r.type === "fix");
  const cats = [...new Set(fixed.map((f) => f.category))];

  if (!accounts.length) {
    return <div className="stagger"><h1>Fix</h1><Empty icon="🏦" title="Zuerst ein Konto anlegen">Gehalt und Fixkosten brauchen ein Konto. <Link to="/konten">Zu den Konten</Link></Empty></div>;
  }

  const statusText = (r: Recurring) => {
    const st = recurringStatus(r, month, payday, settings.start_date ?? null, done);
    if (!r.active) return "pausiert";
    if (st.kind === "nicht") return `fällig im ${MONTHS[(r.month_of_year ?? 1) - 1]}`;
    if (st.kind === "gebucht") return `✓ gebucht ${dateLabel(st.date!)}`;
    if (st.kind === "kontostand") return "✓ schon im Kontostand";
    return `fällig ${dateLabel(st.date!)}`;
  };

  const row = (r: Recurring) => {
    const a = accounts.find((x) => x.id === r.account_id);
    return (
      <div key={r.id} className={`listrow${r.active ? "" : " inactive"}`}>
        <button type="button" className="rowbtn" onClick={() => setSheet({ type: r.type, item: r })}>
          {a && <BankLogo id={a.bank} size={32} />}
          <span><strong>{r.name}</strong>{isYearly(r) && <span className="badge tiny">jährlich</span>}<br /><span className="muted small">{statusText(r)} · {a?.name ?? "Konto fehlt"}</span></span>
        </button>
        <span className="row nowrap">
          <span className="amt">
            <b className={r.type === "einnahme" ? "pos" : ""}>{r.type === "einnahme" ? "+" : "−"}{euro(r.amount_cents)}</b>
            {isYearly(r) && <small className="muted">{euro(Math.round(r.amount_cents / 12))}/Monat</small>}
          </span>
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
        <div className="muted small" style={{ marginBottom: 4 }}>{monthLabel(month)} · {dateLabel(period.start)} – {dateLabel(period.end)}</div>
        <div className="flowrow"><span>Einnahmen</span><b className="pos"><Money cents={s.income} /></b></div>
        <div className="flowrow"><span>− Fixkosten</span><b style={{ color: COLORS.fix }}><Money cents={s.fixed} /></b></div>
        {s.fixedYearlyShare > 0 && <div className="flowrow sub"><span>davon Rücklage für jährliche</span><span>{euro(s.fixedYearlyShare)}</span></div>}
        <div className="flowbar" aria-hidden="true">
          <span style={{ flex: Math.max(0, s.fixed), background: COLORS.fix }} />
          <span style={{ flex: Math.max(0, s.free), background: COLORS.save }} />
        </div>
        <div className="flowrow total"><span>Frei verfügbar</span><b className={s.free < 0 ? "neg" : ""}><Money cents={s.free} /></b></div>
        <Link to="/planen" className="btn wide" style={{ marginTop: 10 }}>Freies Geld verplanen →</Link>
      </div>

      {fixed.length > 0 && (
        <div className="card yearcard">
          <div className="spread"><span className="muted">Fixkosten im Jahr</span><span className="stat"><Money cents={year.total} /></span></div>
          <div className="flowrow sub"><span>Monatliche × 12</span><span>{euro(year.monthly)}</span></div>
          <div className="flowrow sub"><span>Jährliche</span><span>{euro(year.yearly)}</span></div>
          {s.income > 0 && <div className="flowrow sub"><span>Anteil am Jahresgehalt</span><span>{Math.round(year.total / (s.income * 12) * 100)} %</span></div>}
        </div>
      )}

      <div className="card cycle">
        <button type="button" className="rowbtn" onClick={() => setCycleOpen(!cycleOpen)}>
          <span className="emoji">🗓️</span>
          <span className="grow">
            <strong>{payday ? `Budgetmonat ab dem ${payday}.` : "Budgetmonat = Kalendermonat"}</strong><br />
            <span className="muted small">{payday ? `Gehalt vom ${payday}. zählt für den Folgemonat` : "Gehalt zählt für den Monat, in dem es eingeht"}</span>
          </span>
          <span className="muted">{cycleOpen ? "▴" : "▾"}</span>
        </button>
        {cycleOpen && (
          <div className="cyclebody">
            <div className="seg">
              <button type="button" className={payday ? "on" : ""} onClick={() => run(() => saveSettings({ payday: income[0]?.day && income[0].day > 1 ? income[0].day : 26 }))}>Ab Gehaltstag</button>
              <button type="button" className={!payday ? "on" : ""} onClick={() => run(() => saveSettings({ payday: null }))}>Kalendermonat</button>
            </div>
            {payday && (
              <div className="field">
                <label htmlFor="payday">Monat beginnt am</label>
                <select id="payday" value={payday} onChange={(e) => run(() => saveSettings({ payday: Number(e.target.value) }))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}.</option>)}
                </select>
              </div>
            )}
            <p className="hint">
              Gebucht wird automatisch, sobald etwas fällig ist. Alles bis {settings.start_date ? dateLabel(settings.start_date) + " " + settings.start_date.slice(0, 4) : "heute"} steckt
              schon in deinen Kontoständen und wird nicht doppelt gebucht.
            </p>
            <button type="button" className="secondary small" disabled={busy}
              onClick={() => run(async () => { await saveSettings({ start_date: today() }); return "Ab heute wird automatisch gebucht."; })}>Ab heute neu starten</button>
          </div>
        )}
      </div>

      <div className="spread"><h2>Einnahmen</h2><button className="small onbgbtn" onClick={() => setSheet({ type: "einnahme" })}>＋ Gehalt</button></div>
      {income.length ? <div className="card list">{income.map(row)}</div> : <Empty icon="💼" title="Noch kein Gehalt">Trag dein Netto-Gehalt und das Konto ein, auf dem es eingeht.</Empty>}

      <div className="spread"><h2>Fixkosten</h2><button className="small onbgbtn" onClick={() => setSheet({ type: "fix" })}>＋ Fixkosten</button></div>
      {!fixed.length && <Empty icon="🏠" title="Noch keine Fixkosten">Miete, Strom, Handy, Versicherungen, Abos – monatlich oder jährlich.</Empty>}
      {cats.map((c) => {
        const list = fixed.filter((f) => f.category === c).sort((a, b) => Number(isYearly(a)) - Number(isYearly(b)) || a.day - b.day);
        const perMonth = list.filter((x) => x.active).reduce((a, x) => a + (isYearly(x) ? Math.round(x.amount_cents / 12) : x.amount_cents), 0);
        return (
          <div key={c} className="card list">
            <div className="listhead spread"><span>{c}</span><span>{euro(perMonth)}/Monat</span></div>
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
