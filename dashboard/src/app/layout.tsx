import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "GovTender AI — Intelligence Dashboard",
  description: "Government Tender Analyzer for EU & DACH Procurement",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
