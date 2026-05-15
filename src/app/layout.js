import './globals.css';
import { Space_Grotesk, DM_Sans, Space_Mono } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-grotesk',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-space-mono',
});

export const metadata = {
  title: 'Aura AI Studio',
  description:
    'Plan, generate, and assemble cinematic music videos with consistent characters, locations, timing, and final edits in one focused studio.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
