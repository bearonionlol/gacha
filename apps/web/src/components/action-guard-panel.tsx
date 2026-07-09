import { LockKeyhole } from "lucide-react";

type ActionGuardPanelProps = {
  action: string;
  operator?: string;
};

export function ActionGuardPanel({ action, operator }: ActionGuardPanelProps) {
  return (
    <aside className="action-guard-panel" aria-label={`${action} transaction guard`}>
      <div>
        <span className="eyebrow">Phase 4A guard</span>
        <strong>{action}</strong>
      </div>
      <p>Connect wallet before this action can send a testnet transaction.</p>
      {operator ? <small>Approval target: {operator}</small> : null}
      <small>Transaction submission lands in Phase 4B after confirmation, receipt, and retry states are added.</small>
      <LockKeyhole size={16} aria-hidden="true" />
    </aside>
  );
}
