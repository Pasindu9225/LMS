import { getT } from '@/lib/prefs';
import { LangSwitch, ThemeSwitch } from '@/app/ui/prefs';
import { Logo } from '@/app/ui/ui';

/** Centred single-column auth pages; language/theme available before logging in. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden className="accent-rule absolute inset-x-0 top-0 opacity-70" />
      <header className="flex items-center gap-2 p-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo /> {t.common.brand}
        </span>
        <div className="ml-auto flex items-center gap-2"><LangSwitch /><ThemeSwitch /></div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
