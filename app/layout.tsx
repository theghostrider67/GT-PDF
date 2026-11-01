import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "GHOST PDF",
  title: "GHOST PDF — Private PDF Tools",
  description: "38 private PDF tools in one beautiful workspace. Convert, edit, scan, organize, protect, and compare documents on your device.",
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/favicon.svg`,
    shortcut: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/favicon.svg`,
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
