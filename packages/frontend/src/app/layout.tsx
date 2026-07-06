import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/providers";
import Navbar from "@/vite-design/components/Navbar";
import Footer from "@/vite-design/components/Footer";
import TestnetBanner from "@/components/TestnetBanner";
import { Toaster } from "react-hot-toast";

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
          <div className="min-h-screen relative bg-[var(--bg)] text-[var(--ink)] flex flex-col">
            <div className="fixed inset-0 pointer-events-none hero-rings" />
            <TestnetBanner />
            <Navbar />
            <main className="flex-1 pt-24">{children}</main>
            <Footer />
            <Toaster position="bottom-right" toastOptions={{ className: "text-sm" }} />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
