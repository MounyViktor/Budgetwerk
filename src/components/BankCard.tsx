import { useRef, type PointerEvent } from "react";
import { bank, KIND_LABEL } from "../lib/banks";
import { euro } from "../lib/format";
import type { Account } from "../lib/types";
import { BankLogo, Money } from "../ui";

/** Kontokarte in Bankfarben. Kippt leicht mit dem Finger und hat einen wandernden Glanz. */
export function BankCard({ account, big, index = 0 }: { account: Account; big?: boolean; index?: number }) {
  const b = bank(account.bank);
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch" && !big) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  const goal = account.kind === "spar" && account.goal_cents ? account.goal_cents : null;
  return (
    <div ref={ref} className={`bankcard${big ? " big" : ""}`} onPointerMove={move} onPointerLeave={leave}
      style={{ background: `linear-gradient(135deg, ${b.color} 0%, ${b.color2} 100%)`, color: b.ink, animationDelay: `${index * 70}ms` }}>
      <div className="shine" aria-hidden="true" />
      <div className="spread top">
        <BankLogo id={account.bank} size={big ? 44 : 34} />
        <span className="kind">{KIND_LABEL[account.kind]}</span>
      </div>
      <div className="name">{account.name}</div>
      <div className="bal"><Money cents={account.balance_cents} /></div>
      {goal ? (
        <div className="goal">
          <div className="goalbar"><span style={{ width: `${Math.min(100, Math.max(0, account.balance_cents / goal * 100))}%` }} /></div>
          <small>Ziel {euro(goal)}</small>
        </div>
      ) : <small className="bankname">{b.name}</small>}
    </div>
  );
}
