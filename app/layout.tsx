import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Batikara Seragam Calculator",
  description: "School uniform quotation and payment summary calculator",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
