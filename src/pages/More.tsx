import { currentMonth, today } from "../lib/format";
import { isInstalled, isIos, saveFile } from "../lib/device";
import { exportBackup, importBackup, loadDemo, wipeAll } from "../lib/store";
import { BANKS } from "../lib/banks";
import { BankLogo, useAction } from "../ui";

export function More() {
  const { busy, run } = useAction();
  return (
    <div className="stagger">
      <h1>Mehr</h1>

      <div className="card">
        <h3>Datensicherung</h3>
        <p className="muted">Alle Daten liegen nur auf diesem Gerät. Speichere regelmäßig eine Sicherung, am besten in iCloud Drive.</p>
        <div className="actions">
          <button disabled={busy} onClick={() => run(async () => {
            const b = await exportBackup();
            const file = new File([JSON.stringify(b, null, 1)], `budgetwerk-${today()}.json`, { type: "application/json" });
            const r = await saveFile(file);
            return r === "cancelled" ? undefined : "Sicherung erstellt.";
          })}>Sicherung speichern</button>
          <label className={`btn secondary${busy ? " disabled" : ""}`}>
            Sicherung einspielen
            <input type="file" accept="application/json,.json" hidden disabled={busy} onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!window.confirm("Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?")) return;
              void run(async () => { await importBackup(JSON.parse(await f.text())); return "Sicherung eingespielt."; });
            }} />
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Banken</h3>
        <p className="muted">Diese Banken stehen beim Anlegen eines Kontos zur Auswahl.</p>
        <div className="bankrow">
          {BANKS.map((b) => <span key={b.id} className="bankmini"><BankLogo id={b.id} size={40} /><small>{b.name}</small></span>)}
        </div>
      </div>

      {isIos() && !isInstalled() && (
        <div className="card">
          <h3>Auf den Home-Bildschirm</h3>
          <p className="muted">In Safari auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen. Danach Budgetwerk nur noch über das Icon öffnen – iOS trennt die Daten von Safari und der Home-Bildschirm-App.</p>
        </div>
      )}

      <div className="card">
        <h3>Ausprobieren</h3>
        <div className="actions">
          <button className="secondary" disabled={busy} onClick={() => run(async () => { await loadDemo(currentMonth()); return "Beispieldaten hinzugefügt."; })}>Beispieldaten laden</button>
          <button className="danger" disabled={busy} onClick={() => {
            if (!window.confirm("Wirklich alle Konten, Buchungen und Pläne löschen?")) return;
            void run(async () => { await wipeAll(); return "Alles gelöscht."; });
          }}>Alles löschen</button>
        </div>
      </div>

      <p className="onbg small center">Budgetwerk · offline · ohne Bankverbindung<br />Keine Daten verlassen dieses Gerät.</p>
    </div>
  );
}
