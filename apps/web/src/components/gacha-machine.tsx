"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther } from "viem";
import {
  Archive,
  BadgeCheck,
  CircleDot,
  Gem,
  Hammer,
  PackageCheck,
  RotateCw,
  Sparkles,
  Star,
  Store
} from "lucide-react";
import { activeDrop, revealPreview } from "../lib/game-state";
import { loadChainContextFromEnv } from "../lib/deployments";
import type { LiveDropSummary } from "../lib/contracts/live-state";
import { PackPurchasePanel, PackRevealPanel } from "./testnet-write-panels";

type MachineState = "idle" | "turning" | "dispensed";

const dustRewards = [
  { id: "magic", label: "Magic Dust", detail: "100 guaranteed", icon: Sparkles },
  { id: "echo", label: "Echo Dust", detail: "50% each roll", icon: RotateCw },
  { id: "prism", label: "Prism Dust", detail: "35% each roll", icon: Gem },
  { id: "star", label: "Star Dust", detail: "15% each roll", icon: Star }
] as const;

const revealActions = [
  { label: "Keep in Vault", href: "/vault", icon: Archive },
  { label: "List on Market", href: "/market", icon: Store },
  { label: "Open in Forge", href: "/forge", icon: Hammer },
  { label: "Redeem physical", href: "/redemption", icon: BadgeCheck }
] as const;

export function GachaMachine() {
  const chainContext = useMemo(() => loadChainContextFromEnv({
    NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
  }), []);
  const [machineState, setMachineState] = useState<MachineState>("idle");
  const [purchaseId, setPurchaseId] = useState<bigint | null>(null);
  const [liveDropSummary, setLiveDropSummary] = useState<LiveDropSummary | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (turnTimer.current !== null) clearTimeout(turnTimer.current);
    },
    []
  );

  function turnHandle() {
    if (machineState === "turning") return;
    if (turnTimer.current !== null) clearTimeout(turnTimer.current);

    setMachineState("turning");
    turnTimer.current = setTimeout(() => {
      setMachineState("dispensed");
      turnTimer.current = null;
    }, 1050);
  }

  function handlePurchaseConfirmed(nextPurchaseId: bigint) {
    setPurchaseId(nextPurchaseId);
    setMachineState("idle");
  }

  const handleDropSummaryChange = useCallback((summary: LiveDropSummary | null) => {
    setLiveDropSummary(summary);
  }, []);

  const statusMessage = getMachineStatus(machineState, purchaseId);
  const activeStep = purchaseId === null ? 1 : machineState === "dispensed" ? 3 : 2;

  return (
    <section className="gacha-experience" aria-labelledby="gacha-title">
      <header className="gacha-intro">
        <div>
          <span className="eyebrow">Capsule No. 01 / {chainContext.environmentLabel}</span>
          <h1 id="gacha-title">Vault Gacha</h1>
          <p>
            Reserve a vault-backed collectible, turn the capsule handle, then reveal it with the published Dust bundle
            and specialty roll odds.
          </p>
        </div>
        <dl className="gacha-drop-facts" aria-label="Active gacha facts">
          <div>
            <dt>Pull</dt>
            <dd>{liveDropSummary ? `${formatEther(liveDropSummary.price)} ETH` : activeDrop.priceLabel}</dd>
          </div>
          <div>
            <dt>Vault card</dt>
            <dd>1 per pull</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{liveDropSummary?.remainingInventory.toString() ?? activeDrop.remainingSupply} capsule</dd>
          </div>
          <div>
            <dt>Wallet cap</dt>
            <dd>{liveDropSummary?.maxPerWallet.toString() ?? "Published live"}</dd>
          </div>
        </dl>
      </header>

      <div className="gacha-machine-layout">
        <div className="gacha-machine-column">
          <div className={`gacha-machine-frame state-${machineState}`}>
            <Image
              alt="Ivory and lime capsule gacha machine filled with colorful capsules"
              className="gacha-machine-art"
              height={1254}
              priority
              sizes="(max-width: 980px) 92vw, 540px"
              src="/assets/gacha-machine.webp"
              width={1254}
            />
            <button
              aria-describedby="gacha-machine-status"
              aria-label={purchaseId === null ? "Try the gacha machine handle" : "Turn the reserved gacha handle"}
              className="gacha-handle"
              disabled={machineState === "turning"}
              onClick={turnHandle}
              title="Turn handle"
              type="button"
            >
              <RotateCw size={28} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <span className="gacha-capsule" aria-hidden="true">
              <CircleDot size={30} />
            </span>
          </div>

          <div className="gacha-machine-status" id="gacha-machine-status" role="status" aria-live="polite">
            <span className={`machine-light state-${machineState}`} aria-hidden="true" />
            <div>
              <strong>{statusMessage.title}</strong>
              <small>{statusMessage.detail}</small>
            </div>
            <button className="gacha-turn-button" disabled={machineState === "turning"} onClick={turnHandle} type="button">
              <RotateCw size={17} aria-hidden="true" />
              {machineState === "turning" ? "Turning" : machineState === "dispensed" ? "Turn again" : "Turn handle"}
            </button>
          </div>
        </div>

        <div className="gacha-control-deck">
          <div className="gacha-drop-heading">
            <div>
              <span className="eyebrow">Now dispensing</span>
              <h2>{liveDropSummary?.name ?? activeDrop.title}</h2>
            </div>
            <span className="chain-pill">
              {liveDropSummary && !/^0x0{64}$/i.test(liveDropSummary.allowlistRoot) ? "Allowlist required" : "Inventory backed"}
            </span>
          </div>

          <ol className="gacha-steps" aria-label="Gacha pull steps">
            {["Reserve", "Turn", "Reveal"].map((step, index) => {
              const stepNumber = index + 1;
              return (
                <li className={activeStep === stepNumber ? "active" : activeStep > stepNumber ? "complete" : ""} key={step}>
                  <span>{stepNumber}</span>
                  <strong>{step}</strong>
                </li>
              );
            })}
          </ol>

          <div className="gacha-dust-grid" aria-label="Published Dust rewards">
            {dustRewards.map(({ id, label, detail, icon: Icon }) => (
              <div className={`gacha-dust-reward dust-${id}`} key={id}>
                <Icon size={17} aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </div>
            ))}
          </div>

          <details className="gacha-contents" open>
            <summary>
              <span>
                <PackageCheck size={17} aria-hidden="true" />
                Published pull contents
              </span>
              <strong>5 rewards</strong>
            </summary>
            <div className="gacha-contents-list">
              {activeDrop.guarantees.map((reward) => (
                <div key={reward.label}>
                  <span>{reward.label}</span>
                  <strong>{reward.amount}</strong>
                </div>
              ))}
            </div>
            <p>{activeDrop.randomnessDisclosure}</p>
          </details>

          <div className="gacha-wallet-flow">
            <PackPurchasePanel
              onDropSummaryChange={handleDropSummaryChange}
              onPurchaseConfirmed={handlePurchaseConfirmed}
            />
            <PackRevealPanel initialPurchaseId={purchaseId} />
          </div>

          <div className="gacha-aftercare" aria-label="After reveal destinations">
            <span className="eyebrow">After the reveal</span>
            <div>
              {revealActions.map(({ label, href, icon: Icon }) => (
                <Link className="secondary-action" href={href} key={href}>
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </div>
            <small>
              {chainContext.isDemo
                ? `${revealPreview.title} is an illustrative reveal preview. Demo interactions do not reserve inventory.`
                : "The revealed collectible comes from the reserved inventory pool. Collection estimates do not guarantee resale value."}
            </small>
          </div>
        </div>
      </div>
    </section>
  );
}

function getMachineStatus(machineState: MachineState, purchaseId: bigint | null) {
  if (machineState === "turning") {
    return { title: "Capsules in motion", detail: "The handle is completing its turn." };
  }

  if (machineState === "dispensed") {
    return purchaseId === null
      ? { title: "Preview capsule dispensed", detail: "Reserve a pull to bind the handle to an on-chain purchase ID." }
      : { title: `Capsule ${purchaseId.toString()} dispensed`, detail: "Reveal the reserved purchase when randomness is ready." };
  }

  return purchaseId === null
    ? { title: "Machine ready", detail: "The handle is live for a tactile preview." }
    : { title: `Capsule ${purchaseId.toString()} reserved`, detail: "Turn the handle, then reveal the purchase." };
}
