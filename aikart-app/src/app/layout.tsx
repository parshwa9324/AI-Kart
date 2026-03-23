import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Maison Luxe | AI-Kart",
  description: "Enterprise Spatial Try-On Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased`}
      >
        {/* Luxury Ambient Orbs - Persists across all pages */}
        <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-[#050505]">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#D4AF37]/[0.05] blur-[150px] mix-blend-screen animate-drift" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-slate-400/[0.03] blur-[150px] mix-blend-screen animate-drift-slow" />
        </div>

        {children}
      </body>
    </html>
  );
}
