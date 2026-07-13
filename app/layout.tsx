import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fenice Investment System",
  description: "Sistema di monitoraggio per il progetto di investimento 100.000 €",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
