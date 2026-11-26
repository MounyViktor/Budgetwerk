import { useState, type FormEvent } from "react";
import { BANKS, bank, KIND_LABEL } from "../lib/banks";
import { euro, parseEuro } from "../lib/format";
import { addBooking, executeSaving, saveAccount, savePlanItem, saveRecurring, spendOnPlan, transfer } from "../lib/store";
import type { Account, AccountKind, BankId, PlanItem, Recurring } from "../lib/types";
import { vibrate } from "../lib/device";
import { AccountSelect, BankLogo, MoneyInput, toInput, useAction, useConfetti, useSheetClose } from "../ui";

const cents = (s: string) => parseEuro(s) ?? 0;

// --- Konto anlegen / bearbeiten ---

export function AccountForm({ account, presetBank }: { account?: Account; presetBank?: BankId }) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const [bankId, setBankId] = useState<BankId>(account?.bank ?? presetBank ?? "sparkasse");
  const [name, setName] = useState(account?.name ?? bank(presetBank ?? "sparkasse").name);
  const [touchedName, setTouchedName] = useState(Boolean(account));
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? bank(presetBank ?? "sparkasse").defaultKind);
  const [balance, setBalance] = useState(account ? (account.balance_cents / 100).toFixed(2).replace(".", ",") : "");
  const [goal, setGoal] = useState(toInput(account?.goal_cents));

  const pickBank = (id: BankId) => {
    vibrate();
    setBankId(id);
    if (!touchedName) setName(id === "bargeld" ? "Geldbeutel" : bank(id).name);
    if (!account) setKind(bank(id).defaultKind);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const bal = parseEuro(balance || "0");
    if (bal === null) return;
    void run(async () => {
      await saveAccount({ id: account?.id, name: name.trim(), bank: bankId, kind, balance_cents: bal, goal_cents: kind === "spar" ? parseEuro(goal) : null, order: account?.order });
      close();
      return account ? "Konto gespeichert." : `${name.trim()} angelegt.`;
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Bank</label>
        <div className="bankpick">
          {BANKS.map((b) => (
            <button type="button" key={b.id} className={bankId === b.id ? "on" : ""} onClick={() => pickBank(b.id)} aria-pressed={bankId === b.id}>
              <BankLogo id={b.id} size={44} />
              <span>{b.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="acc-name">Name</label>
        <input id="acc-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setTouchedName(true); }} />
      </div>
      <div className="field">
        <label>Art</label>
        <div className="seg">
          {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => (
            <button type="button" key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
      </div>
      <MoneyInput label={account ? "Aktueller Kontostand" : "Guthaben"} value={balance} onChange={setBalance} allowNegative />
      {kind === "kredit" && <p className="hint">Offene Beträge auf der Kreditkarte als Minus eintragen, z. B. -129,90.</p>}
      {kind === "spar" && <MoneyInput label="Sparziel (optional)" value={goal} onChange={setGoal} />}
      <button className="wide" disabled={busy}>{account ? "Speichern" : "Konto anlegen"}</button>
    </form>
  );
}

// --- Ein- und Auszahlung ---

export function BookingForm({ account, direction }: { account: Account; direction: "in" | "out" }) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = cents(amount);
    void run(async () => {
      if (c <= 0) throw new Error("Bitte einen Betrag über 0 eingeben.");
      await addBooking(account.id, direction === "in" ? c : -c, note.trim() || (direction === "in" ? "Einzahlung" : "Auszahlung"), direction === "in" ? "einzahlung" : "auszahlung");
      vibrate();
      close();
      return `${direction === "in" ? "+" : "−"}${euro(c)} gebucht.`;
    });
  };
  return (
    <form onSubmit={submit}>
      <MoneyInput label="Betrag" value={amount} onChange={setAmount} autoFocus />
      <div className="field">
        <label htmlFor="bk-note">Notiz</label>
        <input id="bk-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={direction === "in" ? "z. B. Rückzahlung" : "z. B. Einkauf"} />
      </div>
      <button className="wide" disabled={busy}>{direction === "in" ? "Einzahlen" : "Auszahlen"}</button>
    </form>
  );
}

// --- Umbuchen ---

export function TransferForm({ accounts, from: initialFrom, to: initialTo }: { accounts: Account[]; from?: number; to?: number }) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const [from, setFrom] = useState<number | null>(initialFrom ?? accounts[0]?.id ?? null);
  const [to, setTo] = useState<number | null>(initialTo ?? accounts.find((a) => a.id !== (initialFrom ?? accounts[0]?.id))?.id ?? null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!from || !to) throw new Error("Bitte beide Konten wählen.");
      await transfer(from, to, cents(amount), note.trim());
      vibrate();
      close();
      return `${euro(cents(amount))} umgebucht.`;
    });
  };
  return (
    <form onSubmit={submit}>
      <AccountSelect label="Von" accounts={accounts} value={from} onChange={setFrom} />
      <AccountSelect label="Nach" accounts={accounts} value={to} onChange={setTo} filter={(a) => a.id !== from} />
      <MoneyInput label="Betrag" value={amount} onChange={setAmount} />
      <div className="field">
        <label htmlFor="tr-note">Notiz</label>
        <input id="tr-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Bargeld abheben" />
      </div>
      <button className="wide" disabled={busy}>Umbuchen</button>
    </form>
  );
}

// --- Gehalt / Fixkosten ---

export const FIX_CATEGORIES = ["Wohnen", "Verträge", "Versicherungen", "Mobilität", "Abos", "Kredite", "Sonstiges"];

export function RecurringForm({ accounts, type, item }: { accounts: Account[]; type: Recurring["type"]; item?: Recurring }) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const [name, setName] = useState(item?.name ?? (type === "einnahme" ? "Gehalt" : ""));
  const [amount, setAmount] = useState(toInput(item?.amount_cents));
  const [account, setAccount] = useState<number | null>(item?.account_id ?? accounts.find((a) => a.kind === "giro")?.id ?? accounts[0]?.id ?? null);
  const [day, setDay] = useState(String(item?.day ?? (type === "einnahme" ? 28 : 1)));
  const [category, setCategory] = useState(item?.category ?? (type === "einnahme" ? "Gehalt" : "Wohnen"));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const d = Math.max(1, Math.min(31, Number(day) || 1));
      await saveRecurring({ id: item?.id, type, name: name.trim(), amount_cents: cents(amount), account_id: account ?? 0, day: d, category, active: item?.active ?? true });
      close();
      return "Gespeichert.";
    });
  };
  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="rc-name">Bezeichnung</label>
        <input id="rc-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "einnahme" ? "Gehalt" : "z. B. Miete"} />
      </div>
      <MoneyInput label={type === "einnahme" ? "Netto pro Monat" : "Betrag pro Monat"} value={amount} onChange={setAmount} />
      <AccountSelect label={type === "einnahme" ? "Geht ein auf" : "Wird abgebucht von"} accounts={accounts} value={account} onChange={setAccount} />
      <div className="grid2">
        <div className="field">
          <label htmlFor="rc-day">Am Tag</label>
          <input id="rc-day" type="text" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>
        {type === "fix" && (
          <div className="field">
            <label htmlFor="rc-cat">Kategorie</label>
            <select id="rc-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {FIX_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>
      <button className="wide" disabled={busy}>Speichern</button>
    </form>
  );
}

// --- Planposten ---

const EMOJIS = ["🛒", "⛽", "🍔", "🎉", "👟", "🎁", "✈️", "🏋️", "🐶", "💄", "🎮", "📚", "🚗", "🏠", "💊", "☕"];
const SAVE_EMOJIS = ["🐷", "🏖️", "🚗", "🏠", "🎓", "💍", "🛡️", "📈"];

export function PlanForm({ accounts, month, type, item, free }: { accounts: Account[]; month: string; type: PlanItem["type"]; item?: PlanItem; free: number }) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const [name, setName] = useState(item?.name ?? (type === "sparen" ? "Notgroschen" : ""));
  const [emoji, setEmoji] = useState(item?.emoji ?? (type === "sparen" ? "🐷" : "🛒"));
  const [amount, setAmount] = useState(toInput(item?.amount_cents));
  const [account, setAccount] = useState<number | null>(item ? item.account_id : accounts.find((a) => a.kind === "giro")?.id ?? null);
  const [target, setTarget] = useState<number | null>(item?.target_account_id ?? accounts.find((a) => a.kind === "spar")?.id ?? null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await savePlanItem({ id: item?.id, month, type, name: name.trim(), emoji, amount_cents: cents(amount), account_id: account, target_account_id: type === "sparen" ? target : null, done: item?.done ?? false });
      close();
      return "Im Plan gespeichert.";
    });
  };
  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Symbol</label>
        <div className="emojis">
          {(type === "sparen" ? SAVE_EMOJIS : EMOJIS).map((em) => (
            <button type="button" key={em} className={emoji === em ? "on" : ""} onClick={() => setEmoji(em)}>{em}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="pl-name">Wofür?</label>
        <input id="pl-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "sparen" ? "z. B. Urlaub" : "z. B. Lebensmittel"} />
      </div>
      <MoneyInput label="Betrag diesen Monat" value={amount} onChange={setAmount} />
      {free > 0 && (
        <div className="chips">
          {(type === "sparen" ? [0.1, 0.2, 0.3, 0.5] : [0.05, 0.1, 0.2, 0.3]).map((p) => (
            <button type="button" key={p} className="chip" onClick={() => setAmount((Math.round(free * p) / 100).toFixed(2).replace(".", ","))}>
              {Math.round(p * 100)} % · {euro(Math.round(free * p))}
            </button>
          ))}
        </div>
      )}
      <AccountSelect label={type === "sparen" ? "Von Konto" : "Bezahlt meist von"} accounts={accounts} value={account} onChange={setAccount} allowNone="Offen" />
      {type === "sparen" && (
        <AccountSelect label="Auf Sparkonto" accounts={accounts} value={target} onChange={setTarget} filter={(a) => a.id !== account && a.kind !== "kredit"} />
      )}
      <button className="wide" disabled={busy}>Speichern</button>
    </form>
  );
}

/** Ausgabe zu einem Planposten erfassen */
export function SpendForm({ accounts, item, left }: { accounts: Account[]; item: PlanItem; left: number }) {
  const close = useSheetClose();
  const { busy, run } = useAction();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [account, setAccount] = useState<number | null>(item.account_id ?? accounts[0]?.id ?? null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!account) throw new Error("Bitte ein Konto wählen.");
      await spendOnPlan(item, cents(amount), account, note.trim());
      vibrate();
      close();
      return `${item.emoji} ${euro(cents(amount))} erfasst.`;
    });
  };
  return (
    <form onSubmit={submit}>
      <p className="muted" style={{ marginTop: 0 }}>Noch übrig: <strong>{euro(left)}</strong></p>
      <MoneyInput label="Betrag" value={amount} onChange={setAmount} autoFocus />
      <AccountSelect label="Bezahlt mit" accounts={accounts} value={account} onChange={setAccount} />
      <div className="field">
        <label htmlFor="sp-note">Notiz</label>
        <input id="sp-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Wocheneinkauf" />
      </div>
      <button className="wide" disabled={busy}>Ausgabe erfassen</button>
    </form>
  );
}

export function useSaveNow() {
  const { run } = useAction();
  const confetti = useConfetti();
  return (item: PlanItem, el?: HTMLElement | null) => run(async () => {
    await executeSaving(item);
    vibrate(30);
    const r = el?.getBoundingClientRect();
    confetti(r ? r.left + r.width / 2 : undefined, r ? r.top : undefined);
    return `${item.emoji} ${euro(item.amount_cents)} gespart!`;
  });
}
