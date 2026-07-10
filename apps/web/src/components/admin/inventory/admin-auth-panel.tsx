"use client";

import { KeyRound, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";

import { getInjectedEthereumProvider, requestWalletAccounts } from "../../../lib/contracts/wallet";
import styles from "../../../app/admin/inventory/admin-inventory.module.css";
import { adminRequest } from "./api-client";
import type { AdminSessionView } from "./types";

type AuthResult = { csrfToken: string; session: AdminSessionView };

export function AdminAuthPanel({ onAuthenticated }: { onAuthenticated: (result: AuthResult) => void }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "signing" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);

  const authenticate = async () => {
    setError(null);
    const provider = getInjectedEthereumProvider(window);
    if (provider === null) {
      setError("Install or enable an EVM wallet extension to sign in.");
      return;
    }
    try {
      setStatus("connecting");
      const accounts = await requestWalletAccounts(provider);
      const walletAddress = accounts[0];
      if (walletAddress === undefined) throw new Error("The wallet did not return an account");
      const challengeResponse = await adminRequest<{
        challenge: { message: string; nonce: string; walletAddress: string };
      }>("/api/admin/auth/challenge", { body: { walletAddress }, method: "POST" });
      setStatus("signing");
      const signature = await provider.request({
        method: "personal_sign",
        params: [challengeResponse.challenge.message, walletAddress]
      });
      if (typeof signature !== "string") throw new Error("The wallet returned an invalid signature");
      setStatus("verifying");
      const result = await adminRequest<AuthResult>("/api/admin/auth/verify", {
        body: { nonce: challengeResponse.challenge.nonce, signature, walletAddress },
        method: "POST"
      });
      onAuthenticated(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet authentication failed");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <section className={`panel ${styles.authPanel}`} aria-labelledby="admin-auth-title">
      <div className={styles.authMark}><ShieldCheck aria-hidden="true" size={24} /></div>
      <div className={styles.authCopy}>
        <span className="eyebrow">Restricted operations</span>
        <h2 id="admin-auth-title">Admin wallet sign-in</h2>
        <p>Access is limited to allowlisted operator wallets. Signing does not submit a transaction or spend funds.</p>
        <div className={styles.securityPoints}>
          <span><KeyRound aria-hidden="true" size={15} /> One-time challenge</span>
          <span><WalletCards aria-hidden="true" size={15} /> No private key entry</span>
        </div>
      </div>
      <div className={styles.authAction}>
        <button className="primary-action" disabled={status !== "idle"} onClick={authenticate} type="button">
          {status === "idle" ? <WalletCards aria-hidden="true" size={17} /> : <LoaderCircle aria-hidden="true" className={styles.spin} size={17} />}
          {status === "idle" ? "Sign in with wallet" : status === "signing" ? "Confirm signature" : "Checking access"}
        </button>
        {error !== null ? <p className={styles.errorText} role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
