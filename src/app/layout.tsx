import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/layout/Providers";
import Navbar from "@/components/layout/Navbar";
import ZerodhaNotifications from "@/components/ZerodhaNotifications";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nivesha Wealth Ltd - Automated Trading Platform",
  description: "Professional trading automation platform with Zerodha integration by Nivesha Wealth Ltd",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <Providers>
          <Navbar />
          <main className="min-h-screen">
            {children}
          </main>
          <ZerodhaNotifications />
          <div className="fixed bottom-4 left-4 z-50 bg-blue-500 text-white p-4 rounded shadow-lg">
            <h3 className="font-bold">🔵 LAYOUT TEST</h3>
            <p>This proves layout.tsx is working!</p>
          </div>
        </Providers>
      </body>
    </html>
  );
}
