# Budgetwerk

Budgetplaner als Offline-Web-App fürs iPhone – gleicher Aufbau wie Teilewerk.
Keine Bankverbindung: Konten werden von Hand angelegt, alle Daten bleiben auf dem Gerät (IndexedDB).

## Was die App kann

- **Konten** bei Sparkasse, Revolut, Advanzia, ING, Bargeld oder einer anderen Bank anlegen, Guthaben eintragen, ein- und auszahlen, umbuchen.
- **Fix:** Gehalt (mit Konto und Tag) und monatliche Fixkosten nach Kategorien. Daraus ergibt sich, was frei verfügbar ist.
  „Monat buchen“ schreibt Gehalt und Fixkosten einmal pro Monat auf die Kontostände.
- **Planen:** Das freie Geld auf Posten (Lebensmittel, Tanken …) und Sparraten verteilen. Ausgaben je Posten erfassen,
  Sparrate per Knopf aufs Sparkonto umbuchen. Vormonat übernehmen.
- **Bargeld:** Geldbeutel mit Schnellbeträgen, Ausgaben optional einem Planposten zuordnen, Abhebungen vom Girokonto.
- **Aufgaben und Zeitplanung:** Aufgaben und Termine mit Datum, Uhrzeit, Dauer, Priorität, Projekt, Wiederholung
  (täglich, werktags, wöchentlich, monatlich, jährlich), Unteraufgaben und Notizen.
  Tagesplan mit Wochenleiste und Zeitleiste (Überschneidungen nebeneinander, Antippen legt einen Termin zur Uhrzeit an),
  Liste nach Überfällig / Heute / Morgen / Woche / Später mit Suche und Projektfilter, Projekte mit Fortschritt.
  Schnelleingabe versteht z. B. „Zahnarzt morgen 14:30 1h !! #privat“. Fokus-Timer zählt die gearbeitete Zeit.
  „In Kalender“ erzeugt eine .ics-Datei mit Erinnerung für den iPhone-Kalender.
- **Sicherung** als JSON-Datei speichern und wieder einspielen.
- Animationen: zählende Beträge, Ring-Diagramm, kippende Kontokarten mit Glanz, Blätter von unten, Konfetti beim Sparen.
  Mit „Bewegung reduzieren“ in iOS werden sie abgeschaltet.

## Bank-Logos

Die Banken erscheinen als farbige Abzeichen in den Markenfarben. Echte Logos lassen sich einsetzen:
Datei nach `public/banks/` legen (z. B. `sparkasse.svg`) und in `src/lib/banks.ts` bei der Bank `logo: "banks/sparkasse.svg"` eintragen.
Logos sind Marken der jeweiligen Banken – nur verwenden, wenn die Nutzung erlaubt ist (privat meist unproblematisch).

## Veröffentlichen (GitHub Pages)

Jeder Push auf `main` baut die App über GitHub Actions (`.github/workflows/deploy.yml`) und veröffentlicht sie unter
<https://mounyviktor.github.io/Budgetwerk/>.
Einmalig nötig: Settings → Pages → Source **GitHub Actions**.
GitHub Pages aus einem privaten Repo braucht GitHub Pro.
Die Adresse dauerhaft behalten – der Speicher auf dem iPhone gehört zur Adresse.

Auf dem iPhone: Adresse in Safari öffnen → Teilen → „Zum Home-Bildschirm“ und Budgetwerk danach nur über das Icon öffnen.

## Entwicklung

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Tests der Rechenregeln und Buchungen |
| `npm run build` | Typprüfung und Build nach `dist` |

Technik: React, Vite, TypeScript, IndexedDB, `vite-plugin-pwa` (Offline-Betrieb), Archivo als Schrift.
Regeln in `src/lib/budget.ts`, Speichern in `src/lib/store.ts`.
