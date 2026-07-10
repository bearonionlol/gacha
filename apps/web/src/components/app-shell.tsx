import type { ReactNode } from "react";
import {
  Boxes,
  CircleDot,
  Gem,
  Hammer,
  ShieldCheck,
  Store,
  WalletCards
} from "lucide-react";
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
  return (
    <div className="app-shell">
      <aside className="shell-sidebar" aria-label="Application navigation">
        <a className="brand-mark" href="/" aria-label="Gacha Markets home">
          <span className="brand-icon" aria-hidden="true">
            <Boxes size={18} />
          </span>
          <span>
            <strong>Gacha Markets</strong>
            <small>Vault Arcade</small>
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

        <WalletConnectPanel />
      </aside>

      <div className="shell-content">
        {children}
        <footer className="shell-footer">
          Robinhood Chain testnet build. Pull contents, Dust rewards, fees, and Vault Ascension rules are published
          before wallet confirmation. Resale descriptors identify collector inventory only; no official affiliation or
          endorsement is implied.
        </footer>
      </div>
    </div>
  );
}
