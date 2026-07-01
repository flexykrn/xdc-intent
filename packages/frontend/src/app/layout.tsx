import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/providers";
import Navbar from "@/vite-design/components/Navbar";
import Footer from "@/vite-design/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "XDCIntent — Universal Liquidity on XDC Network",
  description: "Intent-based swap protocol on XDC Network",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrains.variable} font-sans antialiased`}>
        <WalletProvider>
          <div className="min-h-screen relative bg-[var(--bg)] text-[var(--ink)]">
            <div className="fixed inset-0 pointer-events-none hero-rings" />
            <Navbar />
            <main>{children}</main>
            <Footer />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
