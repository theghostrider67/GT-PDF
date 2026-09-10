import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TM PDF — Private PDF Tools",
  description: "Twenty-one free and unlimited PDF, Word, Excel, and PowerPoint tools — all processed in your browser.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
