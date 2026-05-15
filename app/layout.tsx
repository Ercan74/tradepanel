import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TradePanel Institutional Terminal",
  description: "TradingView Automation Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}