import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Inter, Noto_Sans_Sinhala, JetBrains_Mono } from 'next/font/google';
import 'katex/dist/katex.min.css';
import './globals.css';
import { getPrefs } from '@/lib/prefs';
import { PrefsProvider } from '@/app/ui/prefs';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sinhala = Noto_Sans_Sinhala({ subsets: ['sinhala'], weight: ['400', '500', '600', '700'], variable: '--font-sinhala' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono-jb' });

export const metadata: Metadata = { title: 'A/L Tutor', description: 'A/L study assistant' };
export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fafafa' }, { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, theme } = await getPrefs();
  const hasLangCookie = (await cookies()).has('lang');
  return (
    // data-theme only for an explicit choice; "system" is handled by a CSS media query (no flash, no script).
    <html lang={lang} data-theme={theme === 'system' ? undefined : theme} className={`${inter.variable} ${sinhala.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <PrefsProvider lang={lang} theme={theme} hasLangCookie={hasLangCookie}>{children}</PrefsProvider>
      </body>
    </html>
  );
}
