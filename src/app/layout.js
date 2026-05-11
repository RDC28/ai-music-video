import './globals.css';

export const metadata = {
  title: 'Aura AI Studio',
  description:
    'Plan, generate, and assemble cinematic music videos with consistent characters, locations, timing, and final edits in one focused studio.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
