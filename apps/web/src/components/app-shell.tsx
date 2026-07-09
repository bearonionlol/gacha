import type { ReactNode } from "react";
import {
  Boxes,
  CircuitBoard,
  Gem,
  Hammer,
  LayoutDashboard,
  ShieldCheck,
  Store,
  WalletCards
} from "lucide-react";

const navItems = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Vault", href: "/vault", icon: WalletCards },
  { label: "Market", href: "/market", icon: Store },
  { label: "Forge", href: "/forge", icon: Hammer },
  { label: "Redeem", href: "/redemption", icon: Gem },
  { label: "Admin", href: "/admin/inventory", icon: ShieldCheck }
];

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="shell-sidebar" aria-label="Application navigation">
        <a className="brand-mark" href="/" aria-label="Gacha home">
          <span className="brand-icon" aria-hidden="true">
            <Boxes size={18} />
          </span>
          <span>
            <strong>Gacha</strong>
            <small>Terminal</small>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Core routes">
          {navItems.map(({ label, href, icon: Icon }) => (
            <a key={href} href={href} className="nav-link">
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="wallet-card" aria-label="Wallet status">
          <CircuitBoard size={16} aria-hidden="true" />
          <span>Demo wallet</span>
          <strong>Read only</strong>
        </div>
      </aside>

      <div className="shell-content">
        {children}
        <footer className="shell-footer">
          Testnet demo mode. Resale inventory descriptors identify sample items only; no official affiliation or
          endorsement is implied.
        </footer>
      </div>
    </div>
  );
}
