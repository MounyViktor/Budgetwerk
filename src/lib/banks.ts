import type { AccountKind, BankId } from "./types";

export interface Bank {
  id: BankId;
  name: string;
  /** Markenfarbe für Karte und Abzeichen */
  color: string;
  /** Zweite Farbe für den Verlauf auf der Kontokarte */
  color2: string;
  /** Schriftfarbe auf der Markenfarbe */
  ink: string;
  /** Kurzzeichen im Abzeichen, solange kein eigenes Logo hinterlegt ist */
  mark: string;
  /**
   * Optional: eigenes Logo, z. B. "banks/sparkasse.svg" (Datei in public/banks/ ablegen).
   * Ist nichts eingetragen, zeigt die App das farbige Abzeichen.
   */
  logo?: string;
  defaultKind: AccountKind;
}

export const BANKS: Bank[] = [
  { id: "sparkasse", name: "Sparkasse", color: "#E30613", color2: "#9E0410", ink: "#FFFFFF", mark: "S", defaultKind: "giro" },
  { id: "revolut", name: "Revolut", color: "#191C1F", color2: "#4A5BFF", ink: "#FFFFFF", mark: "R", defaultKind: "giro" },
  { id: "advanzia", name: "Advanzia", color: "#0B2D5B", color2: "#C8A24A", ink: "#FFFFFF", mark: "A", defaultKind: "kredit" },
  { id: "ing", name: "ING", color: "#FF6200", color2: "#C24A00", ink: "#FFFFFF", mark: "ING", defaultKind: "spar" },
  { id: "bargeld", name: "Bargeld", color: "#1F9D6B", color2: "#0D5E3F", ink: "#FFFFFF", mark: "€", defaultKind: "bargeld" },
  { id: "andere", name: "Andere Bank", color: "#5B6B84", color2: "#2D3748", ink: "#FFFFFF", mark: "•", defaultKind: "giro" },
];

export const bank = (id: BankId): Bank => BANKS.find((b) => b.id === id) ?? BANKS[BANKS.length - 1];

export const KIND_LABEL: Record<AccountKind, string> = {
  giro: "Girokonto",
  spar: "Sparkonto",
  kredit: "Kreditkarte",
  bargeld: "Bargeld",
};
