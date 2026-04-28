import './globals.css';

export const metadata = {
  title: 'AI Music Video Generator',
  description:
    'Create stunning AI-powered music videos with Google Gemini and Veo 3. Upload your audio, brainstorm concepts, design characters, and assemble cinematic videos.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
