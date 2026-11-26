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
- **Sicherung** als JSON-Datei speichern und wieder einspielen.
- Animationen: zählende Beträge, Ring-Diagramm, kippende Kontokarten mit Glanz, Blätter von unten, Konfetti beim Sparen.
  Mit „Bewegung reduzieren“ in iOS werden sie abgeschaltet.

## Bank-Logos

Die Banken erscheinen als farbige Abzeichen in den Markenfarben. Echte Logos lassen sich einsetzen:
Datei nach `public/banks/` legen (z. B. `sparkasse.svg`) und in `src/lib/banks.ts` bei der Bank `logo: "banks/sparkasse.svg"` eintragen.
Logos sind Marken der jeweiligen Banken – nur verwenden, wenn die Nutzung erlaubt ist (privat meist unproblematisch).

## Veröffentlichen (Cloudflare Pages)

Die App läuft wie Teilewerk über Cloudflare Pages. Einmal einrichten:

1. Cloudflare Dashboard → **Workers & Pages** → **Erstellen** → **Pages** → **Mit Git verbinden**.
2. GitHub verbinden und dabei Zugriff auf das private Repo **Budgetwerk** erlauben.
3. Projektname `budgetwerk`, Branch `main`, Framework-Voreinstellung **Keine**,
   Build-Befehl `npm run build`, Ausgabeverzeichnis `dist`.

Danach baut Cloudflare jeden Push auf `main` neu. `.npmrc` und `.node-version` sorgen dafür, dass der Build dort genauso läuft wie lokal.
GitHub Actions (`.github/workflows/ci.yml`) prüft bei jedem Push nur Tests und Build.
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
