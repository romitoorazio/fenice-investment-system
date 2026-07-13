import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fenice Investment System",
    template: "%s | Fenice Investment System",
  },
  description:
    "Sistema di supporto decisionale per il Progetto 100.000 €: scenario globale, aziende innovative, portafoglio candidato e controllo umano.",
  applicationName: "Fenice Investment System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
