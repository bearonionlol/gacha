import type { ReactNode } from "react";
import {
  Boxes,
  CircleDot,
  Gem,
  Hammer,
  ShieldCheck,
  Store,
  WalletCards,
  RadioTower
} from "lucide-react";
import { loadChainContextFromEnv } from "../lib/deployments";
import { WalletConnectPanel } from "./wallet-connect-panel";

const navItems = [
  { label: "Gacha", href: "/", icon: CircleDot },
  { label: "Vault", href: "/vault", icon: WalletCards },
  { label: "Market", href: "/market", icon: Store },
  { label: "Forge", href: "/forge", icon: Hammer },
  { label: "Redeem", href: "/redemption", icon: Gem },
  { label: "Admin", href: "/admin/inventory", icon: ShieldCheck }
];

type AppShellProps = {
  activePath?: string;
  children: ReactNode;
};

export function AppShell({ activePath = "/", children }: AppShellProps) {
  const chainContext = loadChainContextFromEnv();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#app-main">Skip to content</a>
      <aside className="shell-sidebar" aria-label="Application navigation">
        <a className="brand-mark" href="/" aria-label="Gacha Markets home">
          <span className="brand-icon" aria-hidden="true">
            <Boxes size={18} />
          </span>
          <span>
            <strong>Gacha Markets</strong>
            <small>{chainContext.environmentLabel} vault arcade</small>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Core routes">
          {navItems.map(({ label, href, icon: Icon }) => (
            <a
              aria-current={activePath === href ? "page" : undefined}
              key={href}
              href={href}
              className={activePath === href ? "nav-link active" : "nav-link"}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <WalletConnectPanel chainContext={chainContext} />
      </aside>

      <div className="shell-content">
        <div className={`environment-bar mode-${chainContext.mode}`} role="status">
          <RadioTower size={15} aria-hidden="true" />
          <strong>{chainContext.environmentLabel}</strong>
          <span>{chainContext.disclosure}</span>
        </div>
        <div id="app-main">{children}</div>
        <footer className="shell-footer">
          <strong>{chainContext.chainName}</strong> · Pull contents, odds, Dust rewards, protocol fees, and custody
          effects are shown before confirmation. Collectible names are resale descriptors only; no affiliation or
          endorsement is implied. Collectibles are not investments and no future value is guaranteed.
        </footer>
      </div>
    </div>
  );
}
