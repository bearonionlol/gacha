export const formatCents = (value: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);

export const formatCompactNumber = (value: number): string =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

export const shortenAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;
