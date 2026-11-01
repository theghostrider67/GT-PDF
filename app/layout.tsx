import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "GHOST PDF",
  title: "GHOST PDF — Private PDF Tools",
  description: "Twenty-one free and unlimited PDF, Word, Excel, and PowerPoint tools — all processed in your browser.",
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
