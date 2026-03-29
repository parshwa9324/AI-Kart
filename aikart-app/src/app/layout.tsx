'use client';
import type { Metadata } from "next";
import { Playfair_Display, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { useEffect } from 'react';
import { PhysicalTwinProvider } from '../components/PhysicalTwinProvider';

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // Gold cursor
    const cursor = document.createElement('div');
    cursor.id = 'maison-cursor';
    document.body.appendChild(cursor);

    const move = (e: MouseEvent) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top  = e.clientY + 'px';
    };
    const expand = () => {
      cursor.style.width = '32px';
      cursor.style.height = '32px';
      cursor.style.opacity = '0.6';
    };
    const shrink = () => {
      cursor.style.width = '12px';
      cursor.style.height = '12px';
      cursor.style.opacity = '1';
    };

    document.addEventListener('mousemove', move);
    document.querySelectorAll('a,button,[role="button"]').forEach(el => {
      el.addEventListener('mouseenter', expand);
      el.addEventListener('mouseleave', shrink);
    });

    return () => {
      document.removeEventListener('mousemove', move);
      cursor.remove();
    };
  }, []);

  return (
    <html lang="en" className={`${playfair.variable} ${spaceGrotesk.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className="antialiased grain-overlay">

        {/* ── AMBIENT DEPTH ORBS ── persists across all pages */}
        <div className="fixed inset-0 z-[-2] pointer-events-none overflow-hidden" aria-hidden>
          {/* Warm gold orb — top left */}
          <div style={{
            position: 'absolute', top: '-15%', left: '-5%',
            width: '55%', height: '55%',
            background: 'radial-gradient(circle, rgba(201, 168, 76, 0.07) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float-y 12s ease-in-out infinite',
          }} />
          {/* Deep crimson orb — bottom right (luxury depth) */}
          <div style={{
            position: 'absolute', bottom: '-20%', right: '-10%',
            width: '60%', height: '60%',
            background: 'radial-gradient(circle, rgba(130, 60, 80, 0.05) 0%, transparent 70%)',
            filter: 'blur(100px)',
            animation: 'float-y 18s ease-in-out infinite reverse',
          }} />
          {/* Center AI accent orb */}
          <div style={{
            position: 'absolute', top: '40%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '40%', height: '40%',
            background: 'radial-gradient(circle, rgba(185, 196, 255, 0.03) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
        </div>

        <PhysicalTwinProvider>
          {children}
        </PhysicalTwinProvider>
      </body>
    </html>
  );
}
