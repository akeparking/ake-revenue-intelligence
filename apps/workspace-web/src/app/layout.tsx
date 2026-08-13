import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AKE Revenue Command Center",
  description: "Ads-to-Revenue shadow-pilot CRM",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
