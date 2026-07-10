import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./experience.css";

export const metadata: Metadata = {
  title: "Gacha Markets | Vault Arcade",
  description: "Vault-backed collectible gacha, market, crafting, and redemption on Robinhood Chain."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
