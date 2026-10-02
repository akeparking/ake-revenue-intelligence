import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Sales Workspace | AKE",
  description: "From B2B inquiry to human-qualified opportunity and Mock conversion feedback",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
