import { useRef, useState } from "react";
import { BankCard } from "../components/BankCard";
import { TransferForm } from "../components/Forms";
import { centsToInput, dateLabel, euro, parseEuro } from "../lib/format";
import { loadAll } from "../lib/load";
import { addBooking, deleteBooking, saveAccount, spendOnPlan } from "../lib/store";
import { vibrate } from "../lib/device";
import { Empty, floatText, MoneyInput, Sheet, useAction, useData } from "../ui";
import { groupByMonth } from "./Accounts";

const QUICK = [500, 1000, 2000, 5000];

export function CashPage() {
  const data = useData(loadAll);
  const [walletId, setWalletId] = useState<number | null>(null);
  const [mode, setMode] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [planId, setPlanId] = useState<number | null>(null);
  const [withdraw, setWithdraw] = useState(false);
  const { busy, run } = useAction();
  const btn = useRef<HTMLButtonElement>(null);
  if (!data) return null;
  const wallets = data.accounts.filter((a) => a.kind === "bargeld");
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0];

  if (!wallet) {
    return (
      <div className="stagger">
        <h1>Bargeld</h1>
        <Empty icon="👛" title="Noch kein Geldbeutel">Leg einen Geldbeutel an und trag ein, wie viel Bargeld du gerade hast.</Empty>
        <button className="wide" disabled={busy} onClick={() => run(async () => {
          await saveAccount({ name: "Geldbeutel", bank: "bargeld", kind: "bargeld", balance_cents: 0, goal_cents: null });
          return "Geldbeutel angelegt.";
        })}>👛 Geldbeutel anlegen</button>
      </div>
    );
  }

  const month = data.month;
  const planItems = data.plan.filter((p) => p.month === month && p.type === "ausgabe");
  const list = data.bookings.filter((b) => b.account_id === wallet.id);
  const c = parseEuro(amount) ?? 0;

  const submit = () => run(async () => {
    if (c <= 0) throw new Error("Bitte einen Betrag über 0 eingeben.");
    const item = planItems.find((p) => p.id === planId);
    if (mode === "out" && item) await spendOnPlan(item, c, wallet.id, note.trim());
    else await addBooking(wallet.id, mode === "in" ? c : -c, note.trim() || (mode === "in" ? "Bargeld rein" : "Bar bezahlt"), mode === "in" ? "einzahlung" : "auszahlung");
    vibrate();
    floatText(`${mode === "in" ? "+" : "−"}${euro(c)}`, btn.current, mode === "in" ? "#3EF0B1" : "#FF6B8B");
    setAmount(""); setNote(""); setPlanId(null);
  });

  return (
    <div className="stagger">
      <h1>Bargeld</h1>
      {wallets.length > 1 && (
        <div className="seg onbgseg">
          {wallets.map((w) => <button key={w.id} className={w.id === wallet.id ? "on" : ""} onClick={() => setWalletId(w.id)}>{w.name}</button>)}
        </div>
      )}
      <BankCard account={wallet} big />

      <div className="card cashpad">
        <div className="seg">
          <button className={mode === "out" ? "on" : ""} onClick={() => setMode("out")}>− Ausgeben</button>
          <button className={mode === "in" ? "on" : ""} onClick={() => setMode("in")}>＋ Einnehmen</button>
        </div>
        <MoneyInput label="Betrag" value={amount} onChange={setAmount} />
        <div className="chips">
          {QUICK.map((q) => (
            <button key={q} type="button" className="chip coin" onClick={() => setAmount(centsToInput((parseEuro(amount) ?? 0) + q))}>+{q / 100} €</button>
          ))}
          {amount && <button type="button" className="chip" onClick={() => setAmount("")}>Löschen</button>}
        </div>
        <div className="field">
          <label htmlFor="cash-note">Wofür?</label>
          <input id="cash-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "in" ? "z. B. Trinkgeld" : "z. B. Bäcker"} />
        </div>
        {mode === "out" && planItems.length > 0 && (
          <div className="field">
            <label>Zum Plan zählen (optional)</label>
            <div className="chips">
              {planItems.map((p) => (
                <button key={p.id} type="button" className={`chip${planId === p.id ? " on" : ""}`} onClick={() => setPlanId(planId === p.id ? null : p.id)}>{p.emoji} {p.name}</button>
              ))}
            </div>
          </div>
        )}
        <button ref={btn} className="wide" disabled={busy} onClick={() => { void submit(); }}>
          {mode === "out" ? `${c ? euro(c) + " " : ""}ausgeben` : `${c ? euro(c) + " " : ""}einnehmen`}
        </button>
        {data.accounts.some((a) => a.kind !== "bargeld") && (
          <button className="secondary wide" style={{ marginTop: 8 }} onClick={() => setWithdraw(true)}>🏧 Am Automaten abgehoben</button>
        )}
      </div>

      <h2>Verlauf</h2>
      {!list.length && <Empty icon="🪙" title="Noch keine Bargeld-Buchungen" />}
      {groupByMonth(list).map(([m, items]) => (
        <div key={m} className="card list">
          <div className="listhead spread"><span>{m}</span><span>{euro(items.filter((b) => b.amount_cents < 0).reduce((a, b) => a + b.amount_cents, 0))}</span></div>
          {items.map((b) => (
            <details key={b.id} className="bk">
              <summary className="listrow">
                <span><strong>{b.note}</strong><br /><span className="muted small">{dateLabel(b.date)}</span></span>
                <b className={b.amount_cents < 0 ? "neg" : "pos"}>{b.amount_cents > 0 ? "+" : ""}{euro(b.amount_cents)}</b>
              </summary>
              <div className="row bkactions">
                <button className="danger small" disabled={busy} onClick={() => run(async () => { await deleteBooking(b.id); return "Gelöscht."; })}>Löschen</button>
              </div>
            </details>
          ))}
        </div>
      ))}
      <Sheet open={withdraw} onClose={() => setWithdraw(false)} title="Bargeld abheben">
        <TransferForm accounts={data.accounts} from={data.accounts.find((a) => a.kind === "giro")?.id} to={wallet.id} />
      </Sheet>
    </div>
  );
}
