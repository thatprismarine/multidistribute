import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import WalletContextProvider from "../components/WalletContextProvider";
import { WalletButtons } from "../components/WalletButtons";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MultiDistribute",
  description: "App for using the MultiDistribute program",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletContextProvider>
          <main className="container mx-auto p-8 min-h-screen">
            <div className="max-w-2xl mx-auto">
              <WalletButtons />
              {children}
            </div>
          </main>
        </WalletContextProvider>
      </body>
    </html>
  );
}
