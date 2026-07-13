"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import { Archive, Clock3, PackageCheck, RefreshCw, RotateCcw, Sparkles } from "lucide-react";

import type { CapsulePurchase } from "../lib/capsules";

type CapsuleHistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; capsules: CapsulePurchase[]; configured: boolean }
  | { status: "error" };

export function MyCapsulesPanel({
  account,
  chainId,
  onResume,
  refreshKey = 0
}: {
  account: Address | null;
  chainId: number;
  onResume: (purchaseId: bigint) => void;
  refreshKey?: number;
}) {
  const [history, setHistory] = useState<CapsuleHistoryState>({ status: "idle" });

  useEffect(() => {
    if (account === null) {
      setHistory({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setHistory({ status: "loading" });
    void fetch(`/api/capsules?wallet=${encodeURIComponent(account)}&chainId=${chainId}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) throw new Error("Capsule history request failed");
      return response.json() as Promise<{ capsules: CapsulePurchase[]; configured: boolean }>;
    }).then(
      (payload) => setHistory({ status: "ready", capsules: payload.capsules, configured: payload.configured }),
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setHistory({ status: "error" });
      }
    );
    return () => controller.abort();
  }, [account, chainId, refreshKey]);

  const capsules = history.status === "ready" ? history.capsules : [];
  return (
    <section className="my-capsules" aria-labelledby="my-capsules-title">
      <header>
        <div>
          <span className="eyebrow">Wallet recovery</span>
          <h3 id="my-capsules-title">My capsules</h3>
        </div>
        {history.status === "loading" ? <RefreshCw className="capsule-history-spin" size={16} aria-label="Loading capsule history" /> : null}
      </header>

      {account === null ? (
        <p className="capsule-history-empty">Connect your wallet in the pull controls to restore pending and revealed capsules after a refresh.</p>
      ) : history.status === "error" ? (
        <p className="capsule-history-error">Capsule history is temporarily unavailable. Your on-chain purchase remains intact.</p>
      ) : history.status === "ready" && !history.configured ? (
        <p className="capsule-history-empty">Indexed capsule recovery is not configured in this environment.</p>
      ) : history.status === "ready" && capsules.length === 0 ? (
        <p className="capsule-history-empty">No indexed capsules are associated with this wallet yet.</p>
      ) : capsules.length > 0 ? (
        <div className="capsule-history-list">
          {capsules.map((capsule) => (
            <article className={`capsule-history-row status-${capsule.status}`} key={`${capsule.chainId}:${capsule.purchaseId}`}>
              <span className="capsule-history-icon" aria-hidden="true">
                {capsule.status === "pending" ? <Clock3 size={17} /> : capsule.status === "revealed" ? <PackageCheck size={17} /> : <RotateCcw size={17} />}
              </span>
              <div className="capsule-history-copy">
                <strong>Capsule {capsule.purchaseId}</strong>
                <small>{capsuleLabel(capsule)}</small>
              </div>
              <span className="capsule-history-price">{formatCapsulePrice(capsule.priceWei)}</span>
              {capsule.status === "pending" ? (
                <button className="secondary-action capsule-history-action" onClick={() => onResume(BigInt(capsule.purchaseId))} type="button">
                  <Sparkles size={14} aria-hidden="true" />
                  Resume reveal
                </button>
              ) : capsule.status === "revealed" ? (
                <Link className="secondary-action capsule-history-action" href="/vault">
                  <Archive size={14} aria-hidden="true" />
                  Open Vault
                </Link>
              ) : (
                <span className="capsule-history-refund">Refunded</span>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function capsuleLabel(capsule: CapsulePurchase): string {
  if (capsule.status === "pending") return `Drop ${capsule.dropId} / ready to resume`;
  if (capsule.status === "refunded") return `Drop ${capsule.dropId} / reservation returned`;
  return capsule.inventoryId === null ? `Drop ${capsule.dropId} / revealed` : capsule.inventoryId;
}

function formatCapsulePrice(priceWei: string): string {
  try {
    return `${formatEther(BigInt(priceWei))} ETH`;
  } catch {
    return "Price unavailable";
  }
}
