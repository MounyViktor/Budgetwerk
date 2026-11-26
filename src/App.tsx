import { useEffect, useState } from "react";
import { isInstalled, isIos, requestPersistence } from "./lib/device";
import { AccountDetail, AccountsList } from "./pages/Accounts";
import { CashPage } from "./pages/Cash";
import { FixedPage } from "./pages/Fixed";
import { Home } from "./pages/Home";
import { More } from "./pages/More";
import { PlanPage } from "./pages/Plan";
import { ToastProvider, useRoute } from "./ui";

const TABS = [
  { to: "/", label: "Übersicht", icon: <><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></>, match: (r: string) => r === "/" },
  { to: "/konten", label: "Konten", icon: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></>, match: (r: string) => r.startsWith("/konten") },
  { to: "/fix", label: "Fix", icon: <><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></>, match: (r: string) => r.startsWith("/fix") },
  { to: "/planen", label: "Planen", icon: <><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/></>, match: (r: string) => r.startsWith("/planen") },
  { to: "/bargeld", label: "Bargeld", icon: <><path d="M18 6.5A7 7 0 1 0 18 17.5M4 10h10M4 14h10"/></>, match: (r: string) => r.startsWith("/bargeld") },
  { to: "/mehr", label: "Mehr", icon: <><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></>, match: (r: string) => r.startsWith("/mehr") },
];

function Page({ route }: { route: string }) {
  const seg = route.split("?")[0].split("/").filter(Boolean);
  if (!seg.length) return <Home />;
  if (seg[0] === "konten") {
    const id = Number(seg[1]);
    if (seg[1] && Number.isInteger(id)) return <AccountDetail id={id} />;
    return <AccountsList />;
  }
  if (seg[0] === "fix") return <FixedPage />;
  if (seg[0] === "planen") return <PlanPage />;
  if (seg[0] === "bargeld") return <CashPage />;
  if (seg[0] === "mehr") return <More />;
  return <p className="onbg">Seite nicht gefunden.</p>;
}

/** Auf dem iPhone trennt iOS die Daten von Safari und Home-Bildschirm-App. Deshalb gleich zu Beginn darauf hinweisen. */
function InstallHint() {
  const [show, setShow] = useState(() => isIos() && !isInstalled());
  if (!show) return null;
  return (
    <div className="notice err">
      <strong>Tipp:</strong> In Safari auf Teilen → „Zum Home-Bildschirm“. Danach Budgetwerk nur noch über das Icon öffnen.
      <button className="ghost small" onClick={() => setShow(false)} aria-label="Ausblenden">✕</button>
    </div>
  );
}

export function App() {
  const route = useRoute();
  useEffect(() => { void requestPersistence(); }, []);
  return (
    <ToastProvider>
      <div className="bg" aria-hidden="true"><i /><i /><i /></div>
      <main>
        <InstallHint />
        <div className="page" key={route.split("?")[0]}>
          <Page route={route} />
        </div>
      </main>
      <nav className="tabs" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <a key={t.to} href={`#${t.to}`} className={t.match(route) ? "active" : ""} aria-current={t.match(route) ? "page" : undefined}>
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
            {t.label}
          </a>
        ))}
      </nav>
    </ToastProvider>
  );
}
