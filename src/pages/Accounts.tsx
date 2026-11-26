import { useState } from "react";
import { BankCard } from "../components/BankCard";
import { AccountForm, BookingForm, TransferForm } from "../components/Forms";
import { bank } from "../lib/banks";
import { netWorth } from "../lib/budget";
import { dateLabel, euro } from "../lib/format";
import { loadAll } from "../lib/load";
import { deleteAccount, deleteBooking } from "../lib/store";
import type { Account, AccountKind } from "../lib/types";
import { BankLogo, Empty, go, Link, Money, Sheet, useAction, useData } from "../ui";

const ORDER: AccountKind[] = ["giro", "spar", "kredit", "bargeld"];
const PLURAL: Record<AccountKind, string> = { giro: "Girokonten", spar: "Sparkonten", kredit: "Kreditkarten", bargeld: "Bargeld" };

export function AccountsList() {
  const data = useData(loadAll);
  const [sheet, setSheet] = useState<"new" | "transfer" | null>(null);
  if (!data) return null;
  const { accounts } = data;
  return (
    <div className="stagger">
      <div className="spread">
        <h1>Konten</h1>
      </div>
      <div className="card totalcard">
        <span className="muted">Summe aller Konten</span>
        <span className="stat"><Money cents={netWorth(accounts)} /></span>
      </div>
      <div className="actions">
        <button onClick={() => setSheet("new")}>＋ Konto</button>
        <button className="secondary" disabled={accounts.length < 2} onClick={() => setSheet("transfer")}>⇄ Umbuchen</button>
      </div>
      {!accounts.length && <Empty icon="🏦" title="Noch keine Konten">Lege Sparkasse, Revolut, Advanzia, ING oder Bargeld an.</Empty>}
      {ORDER.map((k) => {
        const list = accounts.filter((a) => a.kind === k);
        if (!list.length) return null;
        return (
          <section key={k}>
            <h2>{PLURAL[k]}</h2>
            <div className="card list">
              {list.map((a) => (
                <Link key={a.id} to={`/konten/${a.id}`} className="listrow accrow">
                  <span className="row nowrap"><BankLogo id={a.bank} size={40} /><span><strong>{a.name}</strong><br /><span className="muted small">{bank(a.bank).name}</span></span></span>
                  <b className={a.balance_cents < 0 ? "neg" : ""}>{euro(a.balance_cents)}</b>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      <Sheet open={sheet === "new"} onClose={() => setSheet(null)} title="Neues Konto"><AccountForm /></Sheet>
      <Sheet open={sheet === "transfer"} onClose={() => setSheet(null)} title="Umbuchen"><TransferForm accounts={accounts} /></Sheet>
    </div>
  );
}

export function AccountDetail({ id }: { id: number }) {
  const data = useData(loadAll);
  const [sheet, setSheet] = useState<"in" | "out" | "transfer" | "edit" | null>(null);
  const { busy, run } = useAction();
  if (!data) return null;
  const a = data.accounts.find((x) => x.id === id);
  if (!a) return <><p className="back"><Link to="/konten">‹ Konten</Link></p><Empty icon="🤷" title="Konto nicht gefunden" /></>;
  const list = data.bookings.filter((b) => b.account_id === id);
  const months = groupByMonth(list);
  return (
    <div className="stagger">
      <p className="back"><Link to="/konten">‹ Konten</Link></p>
      <BankCard account={a} big />
      <div className="quick">
        <button onClick={() => setSheet("in")}><span>＋</span>Einzahlen</button>
        <button onClick={() => setSheet("out")}><span>−</span>Auszahlen</button>
        <button disabled={data.accounts.length < 2} onClick={() => setSheet("transfer")}><span>⇄</span>Umbuchen</button>
        <button onClick={() => setSheet("edit")}><span>✎</span>Bearbeiten</button>
      </div>
      <h2>Buchungen</h2>
      {!list.length && <Empty icon="🧾" title="Noch keine Buchungen" />}
      {months.map(([m, items]) => (
        <div key={m} className="card list">
          <div className="listhead">{m}</div>
          {items.map((b) => (
            <details key={b.id} className="bk">
              <summary className="listrow">
                <span><strong>{b.note}</strong><br /><span className="muted small">{dateLabel(b.date)} · {KIND_TEXT[b.kind] ?? b.kind}</span></span>
                <b className={b.amount_cents < 0 ? "neg" : "pos"}>{b.amount_cents > 0 ? "+" : ""}{euro(b.amount_cents)}</b>
              </summary>
              <div className="row bkactions">
                <button className="danger small" disabled={busy} onClick={() => run(async () => { await deleteBooking(b.id); return "Buchung gelöscht, Kontostand zurückgerechnet."; })}>Buchung löschen</button>
              </div>
            </details>
          ))}
        </div>
      ))}
      <button className="danger" disabled={busy} onClick={() => {
        if (!confirmDelete(a)) return;
        void run(async () => { await deleteAccount(a.id); go("/konten"); return "Konto gelöscht."; });
      }}>Konto löschen</button>
      <Sheet open={sheet === "in"} onClose={() => setSheet(null)} title={`Einzahlen · ${a.name}`}><BookingForm account={a} direction="in" /></Sheet>
      <Sheet open={sheet === "out"} onClose={() => setSheet(null)} title={`Auszahlen · ${a.name}`}><BookingForm account={a} direction="out" /></Sheet>
      <Sheet open={sheet === "transfer"} onClose={() => setSheet(null)} title="Umbuchen"><TransferForm accounts={data.accounts} from={a.id} /></Sheet>
      <Sheet open={sheet === "edit"} onClose={() => setSheet(null)} title="Konto bearbeiten"><AccountForm account={a} /></Sheet>
    </div>
  );
}

function confirmDelete(a: Account) {
  return window.confirm(`„${a.name}“ mit allen Buchungen löschen? Das lässt sich nicht rückgängig machen.`);
}

export const KIND_TEXT: Record<string, string> = {
  einzahlung: "Einzahlung", auszahlung: "Auszahlung", umbuchung: "Umbuchung", gehalt: "Gehalt", fix: "Fixkosten",
  sparen: "Sparen", korrektur: "Kontostand", plan: "Geplante Ausgabe",
};

export function groupByMonth<T extends { date: string }>(list: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const b of list) {
    const [y, m] = b.date.split("-").map(Number);
    const key = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return [...map.entries()];
}
