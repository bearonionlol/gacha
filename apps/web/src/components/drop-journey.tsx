"use client";

import { useState } from "react";
import { DropLobby } from "./drop-lobby";
import { RevealPanel } from "./reveal-panel";

export function DropJourney() {
  const [purchaseId, setPurchaseId] = useState<bigint | null>(null);

  return (
    <>
      <DropLobby onPurchaseConfirmed={setPurchaseId} />
      <RevealPanel purchaseId={purchaseId} />
    </>
  );
}
