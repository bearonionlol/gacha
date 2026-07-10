import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./experience.css";

export const metadata: Metadata = {
  title: "Gacha Markets | Vault Arcade",
  description: "Vault-backed collectible pulls, peer-to-peer trading, crafting, and physical redemption on Robinhood Chain.",
  applicationName: "Gacha Markets"
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#060807"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
