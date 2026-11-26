import { useState } from "react";
import { BankCard } from "../components/BankCard";
import { AccountForm } from "../components/Forms";
import { monthSummary, netWorth, periodOf, ratio, totalsByKind } from "../lib/budget";
import { dateLabel, euro, monthLabel } from "../lib/format";
import { loadAll } from "../lib/load";
import { loadDemo } from "../lib/store";
import { Bar, Donut, Link, Money, Sheet, useAction, useData } from "../ui";

export const COLORS = { fix: "#FF6B8B", spend: "#8C6CFF", save: "#3EF0B1", free: "#FFC857" };

export function Home() {
  const data = useData(loadAll);
  const [newAcc, setNewAcc] = useState(false);
  const { busy, run } = useAction();
  if (!data) return null;
  const { accounts, recurring, plan, bookings, month, payday } = data;
  const period = periodOf(month, payday);
  const s = monthSummary(recurring, plan, bookings, month);
  const kinds = totalsByKind(accounts);
  const savers = accounts.filter((a) => a.kind === "spar");
  const goalSum = savers.reduce((a, x) => a + (x.goal_cents ?? 0), 0);

  if (!accounts.length) {
    return (
      <div className="stagger">
        <h1>Hallo!</h1>
        <div className="card welcome">
          <div className="welcome-art" aria-hidden="true"><span>💶</span><span>🐷</span><span>📊</span></div>
          <h3>Willkommen bei Budgetwerk</h3>
          <p className="muted">Konten anlegen, Gehalt und Fixkosten eintragen und dann planen, wofür das übrige Geld ausgegeben und wie viel gespart wird. Alles bleibt auf diesem Gerät.</p>
          <div className="actions">
            <button onClick={() => setNewAcc(true)}>Erstes Konto anlegen</button>
            <button className="secondary" disabled={busy} onClick={() => run(async () => { await loadDemo(month); return "Beispieldaten geladen."; })}>Beispiel ansehen</button>
          </div>
        </div>
        <Sheet open={newAcc} onClose={() => setNewAcc(false)} title="Neues Konto"><AccountForm /></Sheet>
      </div>
    );
  }

  const parts = [
    { label: "Fixkosten", value: s.fixed, color: COLORS.fix },
    { label: "Ausgaben geplant", value: s.plannedSpend, color: COLORS.spend },
    { label: "Sparen", value: s.plannedSave, color: COLORS.save },
    { label: "Noch frei", value: Math.max(0, s.rest), color: COLORS.free },
  ];

  return (
    <div className="stagger">
      <div className="hero">
        <div>
          <div className="onbg small">Gesamtvermögen</div>
          <h1 className="worth"><Money cents={netWorth(accounts)} /></h1>
        </div>
        <img className="sticker" src="./icon-192.png" alt="" />
      </div>

      <div className="carousel" role="list">
        {accounts.map((a, i) => (
          <Link key={a.id} to={`/konten/${a.id}`} className="plain slide"><BankCard account={a} index={i} /></Link>
        ))}
        <button className="slide addcard" onClick={() => setNewAcc(true)}><span>＋</span>Konto</button>
      </div>

      <h2 className="withsub">{monthLabel(month)}<small>{dateLabel(period.start)} – {dateLabel(period.end)}</small></h2>
      <Link to="/planen" className="card plain monthcard">
        <Donut parts={parts}>
          <small>Noch frei</small>
          <strong className={s.rest < 0 ? "neg" : ""}><Money cents={s.rest} /></strong>
        </Donut>
        <ul className="legend">
          <li><i style={{ background: "transparent", border: "2px solid currentColor" }} />Einnahmen <b>{euro(s.income)}</b></li>
          {parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label} <b>{euro(p.value)}</b></li>)}
        </ul>
      </Link>
      {s.rest < 0 && <div className="notice warn">Du hast {euro(-s.rest)} mehr verplant, als frei ist.</div>}

      <div className="stats">
        <Link to="/konten" className="card plain"><div className="muted">Girokonten</div><div className="stat"><Money cents={kinds.giro} /></div></Link>
        <Link to="/bargeld" className="card plain"><div className="muted">Bargeld</div><div className="stat"><Money cents={kinds.bargeld} /></div></Link>
        <Link to="/konten" className="card plain">
          <div className="muted">Erspartes</div><div className="stat"><Money cents={kinds.spar} /></div>
          {goalSum > 0 && <><Bar value={kinds.spar} max={goalSum} /><div className="muted small">{Math.round(ratio(kinds.spar, goalSum) * 100)} % vom Ziel {euro(goalSum)}</div></>}
        </Link>
        {kinds.kredit !== 0 && <Link to="/konten" className="card plain"><div className="muted">Kreditkarten</div><div className="stat"><Money cents={kinds.kredit} /></div></Link>}
        <Link to="/planen" className="card plain"><div className="muted">Diesen Monat ausgegeben</div><div className="stat"><Money cents={s.spentTotal} /></div>
          {s.plannedSpend > 0 && <><Bar value={s.spentTotal} max={s.plannedSpend} over={s.spentTotal > s.plannedSpend} /><div className="muted small">von {euro(s.plannedSpend)} geplant</div></>}
        </Link>
      </div>

      {bookings.length > 0 && (
        <>
          <h2>Letzte Buchungen</h2>
          <div className="card list">
            {bookings.slice(0, 6).map((b) => {
              const a = accounts.find((x) => x.id === b.account_id);
              return (
                <div key={b.id} className="listrow">
                  <span><strong>{b.note}</strong><br /><span className="muted small">{a?.name ?? "–"} · {b.date.split("-").reverse().join(".")}</span></span>
                  <b className={b.amount_cents < 0 ? "neg" : "pos"}>{b.amount_cents > 0 ? "+" : ""}{euro(b.amount_cents)}</b>
                </div>
              );
            })}
          </div>
        </>
      )}
      <Sheet open={newAcc} onClose={() => setNewAcc(false)} title="Neues Konto"><AccountForm /></Sheet>
    </div>
  );
}
