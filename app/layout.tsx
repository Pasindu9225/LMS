import type { Metadata } from 'next';
import { Noto_Sans_Sinhala } from 'next/font/google';
import 'katex/dist/katex.min.css';
import './globals.css';

const font = Noto_Sans_Sinhala({ subsets: ['sinhala', 'latin'], weight: ['400', '600'] });

export const metadata: Metadata = { title: 'A/L Tutor', description: 'A/L study assistant' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="si">
      <body className={`${font.className} bg-white text-gray-900 antialiased`}>{children}</body>
    </html>
  );
}
