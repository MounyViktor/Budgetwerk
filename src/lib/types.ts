// Alle Beträge in Cent. Monate als "JJJJ-MM", Tage als "JJJJ-MM-TT".

export type BankId = "sparkasse" | "revolut" | "advanzia" | "ing" | "bargeld" | "andere";
export type AccountKind = "giro" | "spar" | "kredit" | "bargeld";

export interface Account {
  id: number;
  name: string;
  bank: BankId;
  kind: AccountKind;
  balance_cents: number;
  /** Sparziel, nur bei Sparkonten */
  goal_cents?: number | null;
  created_at: string;
  order?: number;
}

/** Regelmäßige Einnahme (Gehalt) oder Fixkosten, die jeden Monat am selben Tag anfallen. */
export interface Recurring {
  id: number;
  type: "einnahme" | "fix";
  name: string;
  amount_cents: number;
  account_id: number;
  day: number;
  category: string;
  active: boolean;
}

/** Ein Posten im Monatsplan: wofür das freie Geld ausgegeben oder wohin es gespart wird. */
export interface PlanItem {
  id: number;
  month: string;
  type: "ausgabe" | "sparen";
  name: string;
  emoji: string;
  amount_cents: number;
  /** Von welchem Konto das Geld kommt */
  account_id: number | null;
  /** Nur beim Sparen: Zielkonto */
  target_account_id: number | null;
  /** Sparrate bereits umgebucht */
  done: boolean;
}

export type TxKind = "einzahlung" | "auszahlung" | "umbuchung" | "gehalt" | "fix" | "sparen" | "korrektur" | "plan";

export interface Booking {
  id: number;
  account_id: number;
  date: string;
  amount_cents: number;
  note: string;
  kind: TxKind;
  plan_id?: number | null;
  month?: string | null;
}

export interface Backup {
  format: "budgetwerk-backup";
  version: 1;
  created_at: string;
  accounts: Account[];
  recurring: Recurring[];
  plan: PlanItem[];
  bookings: Booking[];
  meta: Record<string, unknown>;
}
