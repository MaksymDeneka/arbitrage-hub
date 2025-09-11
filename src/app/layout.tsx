import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Crypto Arbitrage Hub',
  description: 'Monitor cryptocurrency arbitrage opportunities across exchanges and DEX platforms in real time',
  keywords: 'crypto, arbitrage, trading, cryptocurrency, DEX, exchanges',
  authors: [{ name: 'Crypto Arbitrage Hub' }],
  robots: 'noindex, nofollow'
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/*Preconnect to RPC providers */}
        <link rel="preconnect" href="https://rpc.ankr.com" />
        <link rel="preconnect" href="https://bsc-dataseed.binance.org" />
        <link rel="dns-prefetch" href="https://stream.binance.com" />
        <link rel="dns-prefetch" href="https://ws.okx.com" />
        <link rel="dns-prefetch" href="https://stream.bybit.com" />
      </head>
      <body className={`${inter.variable} antialiased text-white min-h-screen`}>
        <div className="container mx-auto px-4 py-6">
          {/* HEADER */}
          <header className="mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neutral-700 to-neutral-300 bg-clip-text text-transparent">
              Crypto Arbitrage Hub
            </h1>
            <p className="text-neutral-500 mt-2">
              Real time arbitrage monitoring across exchanges and DEX platforms
            </p>
          </header>
          {/* MAIN CONTENT */}
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
